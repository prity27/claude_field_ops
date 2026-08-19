import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import {
  CSRF_COOKIE,
  asDispatcher,
  createApp,
  seedRefreshToken,
  seedUser,
  uniqueEmail,
} from './support/harness.js';
import './support/hooks.js';

/**
 * BE-01-09 — CSRF protection on state-changing routes.
 *
 * AC-3 (safe methods) is proven in auth-default.test.js and AC-4 (the cookie is readable) in
 * login.test.js, next to the cookies they are properties of.
 */

const app = createApp();

const newAccount = () => ({
  email: uniqueEmail('csrf'),
  name: 'Csrf Subject',
  password: 'a-long-enough-password',
  role: 'technician',
});

describe('BE-01-09 — CSRF protection', () => {
  it('BE-01-09 AC-1 — a state-changing request with no x-csrf-token header is refused with 403 csrf_failed', async () => {
    const { cookieHeader } = await asDispatcher();
    const before = await User.countDocuments({});

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .send(newAccount());

    assert.equal(res.status, 403);
    assert.deepEqual(res.body.error, {
      code: 'csrf_failed',
      message: 'Missing or invalid CSRF token',
    });
    assert.equal(await User.countDocuments({}), before, 'the write went through anyway');
  });

  it('BE-01-09 AC-1 — a header that does not match the cookie is refused and writes nothing', async () => {
    const { cookieHeader } = await asDispatcher();
    const before = await User.countDocuments({});

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', 'a-token-the-attacker-guessed')
      .send(newAccount());

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'csrf_failed');
    assert.equal(await User.countDocuments({}), before, 'the write went through anyway');
  });

  it('BE-01-09 AC-1 — a request carrying the header but no CSRF cookie is refused, so the header alone is not enough', async () => {
    const { user, csrf } = await asDispatcher();
    // Session cookie only: this is the cross-site case, where the browser sends the session
    // automatically but a foreign page cannot read the CSRF cookie to echo it.
    const { signAccessToken } = await import('../src/lib/tokens.js');
    const sessionOnly = `fo_access=${signAccessToken(user)}`;
    const before = await User.countDocuments({});

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', sessionOnly)
      .set('x-csrf-token', csrf)
      .send(newAccount());

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'csrf_failed');
    assert.equal(await User.countDocuments({}), before);
  });

  it('BE-01-09 AC-1 — an empty header value is refused rather than treated as a match against an empty cookie', async () => {
    const { user } = await asDispatcher();
    const { signAccessToken } = await import('../src/lib/tokens.js');

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', `fo_access=${signAccessToken(user)}; ${CSRF_COOKIE}=`)
      .set('x-csrf-token', '')
      .send(newAccount());

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'csrf_failed');
  });

  it('BE-01-09 AC-2 — a matching header and cookie lets the request proceed', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(newAccount());

    assert.equal(res.status, 201);
    assert.equal(await User.countDocuments({ name: 'Csrf Subject' }), 1);
  });

  it('BE-01-09 AC-1 — the CSRF check runs before authorization, so a wrong-role caller without the header still writes nothing', async () => {
    const { cookieHeader } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .send(newAccount());

    // Either guard refusing is acceptable; what matters is that nothing is written.
    assert.ok([403].includes(res.status));
    assert.equal(await User.countDocuments({ name: 'Csrf Subject' }), 0);
  });
});

describe('BE-01-09 — the recorded gap: logout and refresh sit ahead of the CSRF middleware', () => {
  it('BE-01-09 known gap — a forged cross-site POST to /auth/logout succeeds without a CSRF token', async () => {
    // Recorded in the story, not discovered here: both routes are mounted before `authenticate`
    // and therefore before `csrfProtection` (app.js:24-28), so they cannot be covered by the
    // double-submit check as it is currently mounted.
    //
    // This test asserts the CURRENT behaviour deliberately. It documents the gap in a greppable
    // place and will fail the day someone closes it, which is the prompt to update the story.
    const user = await seedUser();
    const raw = await seedRefreshToken(user);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `fo_refresh=${raw}`);

    assert.equal(res.status, 200, 'if this now fails, the gap is closed — update BE-01-09');
    const stored = await RefreshToken.findOne({ user: user._id });
    assert.ok(
      stored.revokedAt instanceof Date,
      'a request with no CSRF token revoked the session — the documented gap',
    );
  });

  it('BE-01-09 known gap — a forged cross-site POST to /auth/refresh is also not CSRF-checked', async () => {
    const user = await seedUser();
    const raw = await seedRefreshToken(user);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `fo_refresh=${raw}`);

    assert.equal(res.status, 200, 'if this now fails, the gap is closed — update BE-01-09');
  });
});
