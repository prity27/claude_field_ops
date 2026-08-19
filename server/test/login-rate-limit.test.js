import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { AuditLog } from '../src/models/AuditLog.js';
import { createApp, seedUser, uniqueEmail } from './support/harness.js';
import './support/hooks.js';

/**
 * BE-01-02 AC-3 — repeated failed attempts from one source are rate-limited, and each failure is
 * logged with the source and the timestamp.
 *
 * This file has to spend more than the limiter's entire budget, so it must be the only file that
 * drives /auth/login: the counter is module-scoped (`routes/auth.js:12`) and shared by every test
 * in a process. `test/run.js` gives each file its own process, which is what lets this be tested
 * at all without editing the source to expose a reset.
 */

const app = createApp();
const LIMIT = 10; // routes/auth.js:12 — rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })

describe('BE-01-02 AC-3 — rate limiting the credential surface', () => {
  it('BE-01-02 AC-3 — attempts beyond the limit are refused with 429 and a Retry-After header', async () => {
    const email = uniqueEmail('bruteforce');

    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrong-password-guess' });
      assert.equal(res.status, 401, `attempt ${attempt} should still be allowed through`);
    }

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password-guess' });

    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'too_many_requests');
    const retryAfter = Number(blocked.headers['retry-after']);
    assert.ok(
      Number.isInteger(retryAfter) && retryAfter > 0,
      `Retry-After was ${blocked.headers['retry-after']}`,
    );
    assert.ok(retryAfter <= 15 * 60, 'Retry-After should not exceed the window');
  });

  it('BE-01-02 AC-3 — once throttled, a correct password gets the same 429, so the limiter cannot be probed around', async () => {
    // The window is exhausted for this source by the test above. A valid credential now gets the
    // same refusal, which is what makes the limiter a defence rather than an inconvenience.
    const user = await seedUser({ role: 'dispatcher' });

    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'anything' });

    assert.equal(res.status, 429);
    assert.equal(
      await AuditLog.countDocuments({ action: 'login.failure' }),
      0,
      'a request refused by the limiter must not be recorded as a credential failure',
    );
  });
});

describe('BE-01-02 AC-3 — what a logged failure records', () => {
  it('BE-01-02 AC-3 — a failed attempt is logged with its timestamp', async () => {
    // The limiter is exhausted for this source by now, so this drives the service directly. The
    // subject is what the audit entry contains, not the HTTP path that produced it.
    const { login } = await import('../src/services/auth.service.js');

    await assert.rejects(() => login(uniqueEmail('timestamp-check'), 'wrong-password'));

    const entries = await AuditLog.find({ action: 'login.failure' });
    assert.equal(entries.length, 1, 'the failure was not audited at all');
    assert.ok(entries[0].createdAt instanceof Date, 'no timestamp on the audit entry');
    assert.equal(entries[0].outcome, 'denied');
  });

  it('BE-01-02 AC-3 — a failed attempt is logged with the source of the attempt', async () => {
    const { login } = await import('../src/services/auth.service.js');

    await assert.rejects(() => login(uniqueEmail('source-check'), 'wrong-password'));

    const [entry] = await AuditLog.find({ action: 'login.failure' });
    assert.ok(entry, 'the failure was not audited at all');

    // AC-3 requires the *source* of the attempt, not merely that one happened. An entry that
    // records neither an actor — there is no account behind an unknown email — nor an origin
    // identifies nobody, so repeated failures cannot be attributed to anyone.
    const recordedSource =
      entry.actor ?? entry.metadata?.ip ?? entry.metadata?.source ?? entry.metadata?.remoteAddress;
    assert.ok(
      recordedSource,
      'BE-01-02 AC-3 requires the source of a failed attempt to be logged; the entry records '
        + `only ${JSON.stringify(entry.metadata)} with actor=${entry.actor}`,
    );
  });
});
