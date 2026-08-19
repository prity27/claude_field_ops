import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import request from 'supertest';
import { AuditLog } from '../src/models/AuditLog.js';
import { ROLES } from '../src/models/User.js';
import { asDispatcher, asTechnician, createApp, uniqueEmail } from './support/harness.js';
import './support/hooks.js';

/** BE-01-06 — one authorization model. */

const app = createApp();
const SRC = new URL('../src/', import.meta.url);

function sourceFiles(dir = SRC, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) sourceFiles(child, found);
    else if (entry.name.endsWith('.js')) found.push({ path: child.href.split('/src/')[1], text: readFileSync(child, 'utf8') });
  }
  return found;
}

describe('BE-01-06 — one authorization model', () => {
  it('BE-01-06 AC-1 — the two roles are defined exactly once, in one place', () => {
    assert.deepEqual(ROLES, ['dispatcher', 'technician']);

    // No second definition anywhere: a role list duplicated in a validator or a route is how the
    // two copies drift and an authorization rule quietly stops matching.
    const offenders = sourceFiles()
      .filter(({ path }) => path !== 'models/User.js')
      .filter(({ text }) => /\[\s*['"]dispatcher['"]\s*,\s*['"]technician['"]\s*\]/.test(text)
        || /\[\s*['"]technician['"]\s*,\s*['"]dispatcher['"]\s*\]/.test(text));

    assert.deepEqual(
      offenders.map((f) => f.path),
      [],
      'the role list is defined in more than one place',
    );
  });

  it('BE-01-06 AC-1 — one mechanism enforces it: requireRole is the only role check in the codebase', () => {
    const files = sourceFiles();

    // The middleware is the single implementation.
    const implementations = files.filter(({ text }) => /export function requireRole/.test(text));
    assert.deepEqual(implementations.map((f) => f.path), ['middleware/authorize.js']);

    // Nothing compares a role by hand instead of going through it.
    const handRolled = files
      .filter(({ path }) => path !== 'middleware/authorize.js')
      .filter(({ text }) => /\.role\s*[=!]==?\s*['"]/.test(text) || /role\s*[=!]==?\s*['"](dispatcher|technician)['"]/.test(text));

    assert.deepEqual(
      handRolled.map((f) => f.path),
      [],
      'a role is compared directly instead of through requireRole',
    );
  });

  it('BE-01-06 AC-2 — the requirement is declared at the route, readable without opening the handler', () => {
    // AC-2 is a structural claim, so this is a structural assertion: the guard sits in the
    // route's own middleware chain, not inside the handler body.
    const usersRouter = app._router.stack
      .map((layer) => layer.handle)
      .find((handle) => handle?.stack?.some((sub) => sub.route?.path === '/users'));
    assert.ok(usersRouter, 'the users router is not mounted');

    const postUsers = usersRouter.stack.find((sub) => sub.route?.path === '/users' && sub.route.methods.post);
    const chain = postUsers.route.stack.map((h) => h.name);

    assert.ok(
      chain.includes('requireRoleMiddleware'),
      `POST /users declares no role requirement at the route; its chain is [${chain.join(', ')}]`,
    );
    // Declared before validation and before the handler, so it cannot be reached around.
    assert.ok(
      chain.indexOf('requireRoleMiddleware') < chain.indexOf('validateBodyMiddleware'),
      'the role check runs after body validation rather than first',
    );

    // And it is visible in the route file itself, which is what "readable without opening the
    // handler" means for a reviewer.
    const routeSource = readFileSync(new URL('routes/users.js', SRC), 'utf8');
    assert.match(routeSource, /requireRole\('dispatcher'\)/);
  });

  it('BE-01-06 AC-4 — a caller whose role lacks the permission gets 403 and the standard envelope', async () => {
    const { cookieHeader, csrf } = await asTechnician();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ email: uniqueEmail('blocked'), name: 'Blocked', password: 'a-long-enough-password', role: 'technician' });

    assert.equal(res.status, 403);
    assert.deepEqual(Object.keys(res.body), ['error']);
    assert.deepEqual(res.body.error, {
      code: 'forbidden',
      message: 'You do not have permission to do that',
    });
  });

  it('BE-01-06 AC-4 — the denial is audited with the actor, the route and the role that was required', async () => {
    const { user, cookieHeader, csrf } = await asTechnician();

    await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ email: uniqueEmail('blocked'), name: 'Blocked', password: 'a-long-enough-password', role: 'technician' });

    const [entry] = await AuditLog.find({ action: 'authorization.denied' });
    assert.ok(entry, 'the denial was not audited');
    assert.equal(String(entry.actor), String(user._id));
    assert.equal(entry.outcome, 'denied');
    assert.equal(entry.targetType, 'route');
    assert.deepEqual(entry.metadata.required, ['dispatcher']);
    assert.equal(entry.metadata.method, 'POST');
    assert.equal(entry.metadata.path, '/users');
    assert.ok(entry.createdAt instanceof Date);
  });

  it('BE-01-06 AC-4 — the permitted role passes the same check, so the 403 is the rule and not a broken route', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ email: uniqueEmail('allowed'), name: 'Allowed', password: 'a-long-enough-password', role: 'technician' });

    assert.equal(res.status, 201);
    assert.equal(await AuditLog.countDocuments({ action: 'authorization.denied' }), 0);
  });

  it('BE-01-06 AC-4 — an unauthenticated caller is stopped before the role check, with 401 rather than 403', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: uniqueEmail('anon'), name: 'Anon', password: 'a-long-enough-password', role: 'technician' });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthenticated');
  });
});
