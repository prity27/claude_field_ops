import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { asDispatcher, asTechnician, createApp } from './support/harness.js';
import './support/hooks.js';

/**
 * BE-01-05 — every route requires authentication unless it opts out.
 * BE-01-09 AC-3 — safe methods are exempt from the CSRF check.
 */

const app = createApp();

describe('BE-01-05 — authentication is the default', () => {
  it('BE-01-05 AC-1 — a protected route rejects an unauthenticated caller with 401 and the standard envelope', async () => {
    const res = await request(app).get('/api/users/me');

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {
      error: { code: 'unauthenticated', message: 'Authentication required' },
    });
  });

  it('BE-01-05 AC-1 — a forged access token is rejected rather than trusted', async () => {
    const res = await request(app).get('/api/users/me').set('Cookie', 'fo_access=not-a-jwt');

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthenticated');
  });

  it('BE-01-05 AC-2 — the opt-out list is exactly GET /api/health and the five auth routes', async () => {
    // Read off the mounted router stack rather than from a hand-written list, so a route added
    // later cannot escape this assertion by not being named in the test.
    const mounted = [];
    for (const layer of app._router.stack) {
      for (const sub of layer.handle?.stack ?? []) {
        if (!sub.route) continue;
        for (const method of Object.keys(sub.route.methods)) {
          mounted.push(`${method.toUpperCase()} /api${sub.route.path}`);
        }
      }
    }
    assert.ok(mounted.length >= 8, `expected to find the mounted routes, saw ${mounted.length}`);

    // A route is public when it is reached with no cookies at all. "Reached" is the absence of
    // the `unauthenticated` code specifically — POST /api/auth/refresh answers 401 on a missing
    // refresh token, which means it ran, not that it was blocked.
    const publicRoutes = [];
    for (const entry of mounted) {
      const [method, path] = entry.split(' ');
      const res = await request(app)[method.toLowerCase()](path).send({});
      if (res.body?.error?.code !== 'unauthenticated') publicRoutes.push(entry);
    }

    assert.deepEqual(
      publicRoutes.sort(),
      [
        'GET /api/health',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'POST /api/auth/password-reset/complete',
        'POST /api/auth/password-reset/request',
        'POST /api/auth/refresh',
      ],
      'the set of routes reachable without a session must not grow without a reviewed decision',
    );
  });

  it('BE-01-05 AC-2 — docs/API.md documents the opt-out list rather than leaving it implicit in the code', () => {
    const api = readFileSync(new URL('../../docs/API.md', import.meta.url), 'utf8');

    assert.match(api, /the entire opt-out list/, 'docs/API.md must state which routes are public');
    assert.match(api, /GET \/api\/health/);
    for (const route of ['login', 'refresh', 'logout', 'password-reset/request', 'password-reset/complete']) {
      assert.match(api, new RegExp(`/api/auth/${route.replace('/', '\\/')}`), `${route} must be documented`);
    }
  });

  it('BE-01-05 AC-3 — a path with no auth declaration is protected: an unknown /api route answers 401, not 404', async () => {
    // The safe default is the whole point of the story. `authenticate` is mounted on /api ahead
    // of every protected router, so a route someone forgets to declare inherits protection.
    const res = await request(app).get('/api/route-nobody-has-written-yet');

    assert.equal(res.status, 401, 'an undeclared /api path must not be reachable without a session');
    assert.equal(res.body.error.code, 'unauthenticated');
  });

  it('BE-01-05 AC-3 — the same unknown path answers 404 once authenticated, proving the 401 came from the default and not from routing', async () => {
    const { cookieHeader } = await asDispatcher();

    const res = await request(app)
      .get('/api/route-nobody-has-written-yet')
      .set('Cookie', cookieHeader);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });
});

describe('BE-01-09 AC-3 — safe methods are exempt from the CSRF check', () => {
  it('BE-01-09 AC-3 — an authenticated GET succeeds with no x-csrf-token header', async () => {
    const { user, cookieHeader } = await asTechnician();

    const res = await request(app).get('/api/users/me').set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.actor, { id: String(user._id), role: 'technician' });
  });
});
