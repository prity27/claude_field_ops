import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { RefreshToken } from '../src/models/RefreshToken.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  config,
  cookie,
  createApp,
  seedRefreshToken,
  seedUser,
} from './support/harness.js';
import './support/hooks.js';

/** BE-01-03 — refresh and log out. */

const app = createApp();

const refreshCookie = (raw) => `${REFRESH_COOKIE}=${raw}`;

describe('BE-01-03 — refresh', () => {
  it('BE-01-03 AC-1 — a valid refresh token is exchanged for a new access token', async () => {
    const user = await seedUser({ role: 'technician' });
    const raw = await seedRefreshToken(user);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(raw));

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { refreshed: true });

    const access = cookie(res, ACCESS_COOKIE);
    assert.ok(access, 'no new access token cookie was issued');
    assert.equal(access.maxAge, config.accessTtlSeconds);
    assert.equal(access.httpOnly, true);

    // The new access token is a working session.
    const me = await request(app).get('/api/users/me').set('Cookie', `${ACCESS_COOKIE}=${access.value}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.actor.id, String(user._id));
    assert.equal(me.body.actor.role, 'technician');
  });

  it('BE-01-03 AC-1 — refreshing does not rotate or consume the refresh token, so it can be used again', async () => {
    const user = await seedUser();
    const raw = await seedRefreshToken(user);

    const first = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(raw));
    const second = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(raw));

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(cookie(first, REFRESH_COOKIE), undefined, 'refresh should not reissue the refresh cookie');
  });

  it('BE-01-03 AC-4 — a malformed refresh token is refused with 401 and the standard envelope', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie('not-a-real-token'));

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      error: { code: 'invalid_refresh_token', message: 'Refresh token missing or invalid' },
    });
    assert.equal(cookie(res, ACCESS_COOKIE), undefined, 'an access token was issued anyway');
  });

  it('BE-01-03 AC-4 — a missing refresh token is refused with 401', async () => {
    const res = await request(app).post('/api/auth/refresh');

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'invalid_refresh_token');
    assert.equal(cookie(res, ACCESS_COOKIE), undefined);
  });

  it('BE-01-03 AC-4 — an expired refresh token is refused with 401 and is indistinguishable from a revoked one', async () => {
    const user = await seedUser();
    const expired = await seedRefreshToken(user, { expiresAt: new Date(Date.now() - 1000) });
    const revoked = await seedRefreshToken(user, { revokedAt: new Date() });

    const expiredRes = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(expired));
    const revokedRes = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(revoked));

    for (const res of [expiredRes, revokedRes]) {
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'invalid_refresh_token');
      assert.equal(cookie(res, ACCESS_COOKIE), undefined);
    }
    assert.deepEqual(expiredRes.body, revokedRes.body);
  });

  it('BE-01-03 AC-4 — a token that expires exactly now is already invalid, not still valid', async () => {
    const user = await seedUser();
    // The service compares `expiresAt <= new Date()`, so the boundary belongs to the expired side.
    const raw = await seedRefreshToken(user, { expiresAt: new Date(Date.now() - 1) });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(raw));

    assert.equal(res.status, 401);
  });

  it('BE-01-03 AC-3 — a refresh token belonging to a deactivated user stops working', async () => {
    const user = await seedUser({ role: 'technician', active: false });
    const raw = await seedRefreshToken(user);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(raw));

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'invalid_refresh_token');
    assert.equal(cookie(res, ACCESS_COOKIE), undefined);
  });
});

describe('BE-01-03 — log out', () => {
  it('BE-01-03 AC-2 — logging out revokes the refresh token server-side and clears the cookies', async () => {
    const user = await seedUser();
    const raw = await seedRefreshToken(user);

    const res = await request(app).post('/api/auth/logout').set('Cookie', refreshCookie(raw));

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { loggedOut: true });

    // Server-side state, not merely a cleared cookie — a stateless token could not satisfy this.
    const stored = await RefreshToken.findOne({ user: user._id });
    assert.ok(stored.revokedAt instanceof Date, 'the refresh token was not revoked in the database');

    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      const cleared = cookie(res, name);
      assert.ok(cleared, `${name} was not cleared`);
      assert.equal(cleared.value, '');
    }
  });

  it('BE-01-03 AC-2 / BE-01-03 AC-3 — a refresh token invalidated by logout cannot be reused', async () => {
    const user = await seedUser();
    const raw = await seedRefreshToken(user);

    await request(app).post('/api/auth/logout').set('Cookie', refreshCookie(raw));
    const reused = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(raw));

    assert.equal(reused.status, 401);
    assert.equal(reused.body.error.code, 'invalid_refresh_token');
    assert.equal(cookie(reused, ACCESS_COOKIE), undefined, 'a new access token was issued for a logged-out session');
  });

  it('BE-01-03 AC-2 — logging out twice is idempotent and does not move the revocation timestamp', async () => {
    const user = await seedUser();
    const raw = await seedRefreshToken(user);

    await request(app).post('/api/auth/logout').set('Cookie', refreshCookie(raw));
    const firstRevokedAt = (await RefreshToken.findOne({ user: user._id })).revokedAt;

    const second = await request(app).post('/api/auth/logout').set('Cookie', refreshCookie(raw));

    assert.equal(second.status, 200);
    const secondRevokedAt = (await RefreshToken.findOne({ user: user._id })).revokedAt;
    assert.equal(
      secondRevokedAt.getTime(),
      firstRevokedAt.getTime(),
      'the second logout rewrote the revocation timestamp',
    );
  });

  it('BE-01-03 AC-2 — logging out one session leaves another session for the same user alive', async () => {
    const user = await seedUser();
    const laptop = await seedRefreshToken(user);
    const phone = await seedRefreshToken(user);

    await request(app).post('/api/auth/logout').set('Cookie', refreshCookie(laptop));

    const stillValid = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(phone));
    assert.equal(stillValid.status, 200, 'logging out on one device killed the other');
    assert.equal(await RefreshToken.countDocuments({ user: user._id, revokedAt: null }), 1);
  });

  it('BE-01-03 — logging out with no session is not an error', async () => {
    const res = await request(app).post('/api/auth/logout');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { loggedOut: true });
  });
});
