import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { AuditLog } from '../src/models/AuditLog.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  PASSWORD,
  REFRESH_COOKIE,
  config,
  cookie,
  createApp,
  login,
  seedUser,
  uniqueEmail,
} from './support/harness.js';
import './support/hooks.js';

/**
 * BE-01-02 — log in. Also BE-01-09 AC-4, which is a property of the cookies login sets.
 *
 * Budget note: `routes/auth.js:12` builds its rate limiter at module scope with a ceiling of 10
 * requests per 15 minutes, and `beforeEach` cannot clear it. Every file therefore has a budget of
 * 10 requests to /auth/login and the two reset routes combined, which is why rate limiting and
 * response timing live in files of their own. This file spends 7. Adding a test that logs in
 * means checking that number.
 */

const app = createApp();

describe('BE-01-02 — log in', () => {
  it('BE-01-02 AC-1 — valid credentials return 200, the user and their role', async () => {
    const user = await seedUser({ role: 'technician' });

    const { res } = await login(app, request, user.email);

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body), ['user']);
    assert.deepEqual(res.body.user, {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: 'technician',
    });
    assert.doesNotMatch(JSON.stringify(res.body), /password|\$2[aby]\$/i);
  });

  it('BE-01-02 AC-1 — an access token and a refresh token are issued as cookies with the documented lifetimes', async () => {
    const user = await seedUser({ role: 'dispatcher' });

    const { res } = await login(app, request, user.email);

    const access = cookie(res, ACCESS_COOKIE);
    const refresh = cookie(res, REFRESH_COOKIE);
    assert.ok(access, 'no access token cookie was set');
    assert.ok(refresh, 'no refresh token cookie was set');

    // docs/API.md documents 15 minutes and 30 days; config/env.js:28 is the source of both.
    assert.equal(access.maxAge, config.accessTtlSeconds);
    assert.equal(access.maxAge, 15 * 60);
    assert.equal(refresh.maxAge, config.refreshTtlSeconds);
    assert.equal(refresh.maxAge, 30 * 24 * 60 * 60);

    assert.equal(access.httpOnly, true);
    assert.equal(refresh.httpOnly, true);
    assert.equal(access.sameSite, 'Strict');
    assert.equal(refresh.sameSite, 'Strict');

    // The refresh token is server-side state, not a self-validating token (BE-01-03 AC-2).
    const stored = await RefreshToken.find({ user: user._id });
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0].tokenHash, refresh.value, 'the raw refresh token was stored');
    assert.equal(stored[0].revokedAt, null);
  });

  it('BE-01-09 AC-4 — the CSRF cookie is readable by the client while both token cookies are not', async () => {
    const user = await seedUser();

    const { res } = await login(app, request, user.email);

    const csrf = cookie(res, CSRF_COOKIE);
    assert.ok(csrf, 'no CSRF cookie was set');
    assert.equal(csrf.httpOnly, false, 'the client must be able to read it to echo it back');
    assert.ok(csrf.value.length >= 16, 'the CSRF token is too short to be unguessable');

    // It is not a credential on its own: presenting it without the session cookies gets nowhere.
    const alone = await request(app)
      .get('/api/users/me')
      .set('Cookie', `${CSRF_COOKIE}=${csrf.value}`);
    assert.equal(alone.status, 401);
  });

  it('BE-01-02 AC-2 / BE-01-02 AC-4 — an unknown email, a wrong password and a deactivated account are indistinguishable', async () => {
    const active = await seedUser({ role: 'dispatcher' });
    const deactivated = await seedUser({ role: 'technician', active: false });

    const unknown = await login(app, request, uniqueEmail('nobody'));
    const wrongPassword = await login(app, request, active.email, 'not-the-right-password');
    const inactive = await login(app, request, deactivated.email, PASSWORD);

    const responses = [unknown.res, wrongPassword.res, inactive.res];

    for (const res of responses) {
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, {
        error: { code: 'invalid_credentials', message: 'Invalid email or password' },
      });
      // No session is established on any of the three.
      assert.equal(cookie(res, ACCESS_COOKIE), undefined);
      assert.equal(cookie(res, REFRESH_COOKIE), undefined);
    }

    // Byte-identical, not merely equivalent.
    const bodies = responses.map((r) => JSON.stringify(r.body));
    assert.equal(new Set(bodies).size, 1, `the three failures differ: ${bodies.join(' | ')}`);

    // AC-4 specifically: correct credentials for a deactivated account still fail, and no
    // session is left behind for it.
    assert.equal(await RefreshToken.countDocuments({ user: deactivated._id }), 0);
  });

  it('BE-01-02 AC-2 — a malformed body is rejected before any credential is looked at', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'someone@example.test' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
    assert.match(res.body.error.message, /password/);
  });

  it('BE-01-02 — a successful login is audited and a failed one is audited as denied', async () => {
    const user = await seedUser({ role: 'dispatcher' });

    await login(app, request, user.email);

    const entries = await AuditLog.find({}).sort({ createdAt: 1 });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, 'login.success');
    assert.equal(entries[0].outcome, 'success');
    assert.equal(String(entries[0].actor), String(user._id));
    assert.ok(entries[0].createdAt instanceof Date);
  });
});
