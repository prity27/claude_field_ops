import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { AuditLog } from '../src/models/AuditLog.js';
import { PasswordResetToken } from '../src/models/PasswordResetToken.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookie,
  createApp,
  seedRefreshToken,
  seedResetToken,
  seedUser,
} from './support/harness.js';
import './support/hooks.js';

/** BE-01-04 AC-2 / BE-01-04 AC-3 / BE-01-04 AC-4 — completing a password reset. */

const app = createApp();
const NEW_PASSWORD = 'a-brand-new-long-password';

const complete = (token, password = NEW_PASSWORD) =>
  request(app).post('/api/auth/password-reset/complete').send({ token, password });

async function hashOf(user) {
  return (await User.findById(user._id).select('+passwordHash')).passwordHash;
}

describe('BE-01-04 — completing a password reset', () => {
  it('BE-01-04 AC-2 — a valid token resets the password and is marked used', async () => {
    const user = await seedUser({ role: 'dispatcher' });
    const before = await hashOf(user);
    const token = await seedResetToken(user);

    const res = await complete(token);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { reset: true });

    const after = await hashOf(user);
    assert.notEqual(after, before, 'the password was not changed');
    assert.match(after, /^\$2[aby]\$(1[2-9]|[2-9]\d)\$/, 'the new password was not hashed at cost >= 12');

    const stored = await PasswordResetToken.findOne({ user: user._id });
    assert.ok(stored.usedAt instanceof Date, 'the token was not marked used');
  });

  it('BE-01-04 AC-2 — the token is single-use: presenting it a second time fails and leaves the password alone', async () => {
    const user = await seedUser();
    const token = await seedResetToken(user);

    const first = await complete(token);
    assert.equal(first.status, 200);
    const afterFirst = await hashOf(user);

    const second = await complete(token, 'yet-another-long-password');

    assert.equal(second.status, 400);
    assert.equal(second.body.error.code, 'invalid_reset_token');
    assert.equal(await hashOf(user), afterFirst, 'the second use changed the password again');
  });

  it('BE-01-04 AC-3 — completing a reset invalidates every existing session for that user', async () => {
    const user = await seedUser();
    const laptop = await seedRefreshToken(user);
    const phone = await seedRefreshToken(user);
    const token = await seedResetToken(user);

    const res = await complete(token);
    assert.equal(res.status, 200);

    // Server-side, not merely cookie-cleared.
    assert.equal(
      await RefreshToken.countDocuments({ user: user._id, revokedAt: null }),
      0,
      'a refresh token survived the password change',
    );

    // And neither of them works any more (BE-01-03 AC-3).
    for (const raw of [laptop, phone]) {
      const reused = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${raw}`);
      assert.equal(reused.status, 401);
      assert.equal(reused.body.error.code, 'invalid_refresh_token');
      assert.equal(cookie(reused, ACCESS_COOKIE), undefined);
    }

    // The caller's own cookies are cleared too.
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      assert.equal(cookie(res, name)?.value, '', `${name} was not cleared`);
    }
  });

  it('BE-01-04 AC-3 — another user\'s sessions are untouched', async () => {
    const user = await seedUser();
    const bystander = await seedUser();
    await seedRefreshToken(bystander);
    const token = await seedResetToken(user);

    await complete(token);

    assert.equal(
      await RefreshToken.countDocuments({ user: bystander._id, revokedAt: null }),
      1,
      'resetting one password revoked a different user\'s session',
    );
  });

  it('BE-01-04 AC-4 — an already-used token fails with 400 and changes no password', async () => {
    const user = await seedUser();
    const before = await hashOf(user);
    const token = await seedResetToken(user, { usedAt: new Date() });

    const res = await complete(token);

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_reset_token');
    assert.equal(await hashOf(user), before, 'a used token changed the password');
  });

  it('BE-01-04 AC-4 — an expired token fails with 400 and changes no password', async () => {
    const user = await seedUser();
    const before = await hashOf(user);
    const token = await seedResetToken(user, { expiresAt: new Date(Date.now() - 1000) });

    const res = await complete(token);

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_reset_token');
    assert.equal(await hashOf(user), before, 'an expired token changed the password');
  });

  it('BE-01-04 AC-4 — an unknown token fails identically to a used or expired one', async () => {
    const res = await complete('a-token-nobody-ever-issued');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: { code: 'invalid_reset_token', message: 'This reset link is invalid or has expired' },
    });
  });

  it('BE-01-04 — the new password must meet the same 12-character minimum as provisioning', async () => {
    const user = await seedUser();
    const before = await hashOf(user);
    const token = await seedResetToken(user);

    const res = await complete(token, 'short');

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
    assert.match(res.body.error.message, /password/);
    assert.equal(await hashOf(user), before);
    // The token survives a rejected attempt, so a typo does not burn the link.
    assert.equal((await PasswordResetToken.findOne({ user: user._id })).usedAt, null);
  });

  it('BE-01-04 — a completed reset is audited against the account it changed', async () => {
    const user = await seedUser();
    const token = await seedResetToken(user);

    await complete(token);

    const entries = await AuditLog.find({ action: 'password.reset' });
    assert.equal(entries.length, 1);
    assert.equal(String(entries[0].actor), String(user._id));
    assert.equal(entries[0].outcome, 'success');
    assert.ok(entries[0].createdAt instanceof Date);
  });
});
