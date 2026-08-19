import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { PasswordResetToken } from '../src/models/PasswordResetToken.js';
import { config, createApp, seedUser, uniqueEmail } from './support/harness.js';
import './support/hooks.js';

/**
 * BE-01-04 AC-1 / BE-01-04 AC-2 — requesting a reset.
 *
 * Split from the completion tests because the reset routes share the module-scoped rate limiter
 * with /auth/login (`routes/auth.js:12`), giving each file a budget of 10 requests.
 */

const app = createApp();

describe('BE-01-04 — requesting a password reset', () => {
  it('BE-01-04 AC-1 — the response is identical whether or not the account exists', async () => {
    const existing = await seedUser({ role: 'dispatcher' });

    const forReal = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: existing.email });
    const forNobody = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: uniqueEmail('nobody') });

    assert.equal(forReal.status, 202);
    assert.equal(forNobody.status, 202);
    assert.deepEqual(forReal.body, { requested: true });
    assert.deepEqual(forNobody.body, forReal.body);

    // Only the side effect differs — which is the point of the criterion.
    assert.equal(await PasswordResetToken.countDocuments({ user: existing._id }), 1);
    assert.equal(await PasswordResetToken.countDocuments({}), 1);
  });

  it('BE-01-04 AC-1 — a deactivated account gets the same response and no token', async () => {
    const deactivated = await seedUser({ role: 'technician', active: false });

    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: deactivated.email });

    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { requested: true });
    assert.equal(
      await PasswordResetToken.countDocuments({ user: deactivated._id }),
      0,
      'a reset token was minted for a deactivated account',
    );
  });

  it('BE-01-04 AC-2 — the token is time-limited and only its hash is persisted', async () => {
    const user = await seedUser();
    const requestedAt = Date.now();

    await request(app).post('/api/auth/password-reset/request').send({ email: user.email });

    const stored = await PasswordResetToken.findOne({ user: user._id });
    assert.ok(stored, 'no reset token was created');
    assert.equal(stored.usedAt, null);

    // Time-limited, to the TTL the configuration declares (config/env.js:30, 1 hour by default).
    const ttlMs = stored.expiresAt.getTime() - requestedAt;
    assert.ok(
      Math.abs(ttlMs - config.passwordResetTtlSeconds * 1000) < 5000,
      `expiry is ${ttlMs}ms out, expected ~${config.passwordResetTtlSeconds * 1000}ms`,
    );

    // A sha256 hex digest, not the token itself — a database leak must not hand over live resets.
    assert.match(stored.tokenHash, /^[0-9a-f]{64}$/);
  });

  it('BE-01-04 AC-2 — the token is delivered out of band and never returned to the caller', async () => {
    const user = await seedUser();

    // lib/mailer.js logs the link because PROFILE.md records no mail transport. Capturing that
    // channel is how the raw token becomes observable to a test at all — which is itself the
    // proof that the HTTP response does not carry it.
    const delivered = [];
    const realLog = console.log;
    console.log = (...args) => { delivered.push(args.join(' ')); };
    let res;
    try {
      res = await request(app).post('/api/auth/password-reset/request').send({ email: user.email });
    } finally {
      console.log = realLog;
    }

    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { requested: true });

    const line = delivered.find((l) => l.includes('[mailer]'));
    assert.ok(line, 'the reset link was not delivered out of band');
    assert.match(line, /token=/);
    const rawToken = line.split('token=')[1].trim();
    assert.ok(rawToken.length >= 32, 'the delivered token is too short to be unguessable');

    // The raw token appears in the out-of-band channel and nowhere in the HTTP exchange.
    const httpExchange = JSON.stringify({ body: res.body, headers: res.headers });
    assert.ok(!httpExchange.includes(rawToken), 'the reset token leaked into the HTTP response');
  });

  it('BE-01-04 — a request for a malformed address is rejected with the standard envelope', async () => {
    const res = await request(app).post('/api/auth/password-reset/request').send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
    assert.match(res.body.error.message, /email/);
  });
});
