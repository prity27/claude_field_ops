import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { AuditLog } from '../src/models/AuditLog.js';
import { User } from '../src/models/User.js';
import {
  asDispatcher,
  asTechnician,
  createApp,
  seedUser,
  uniqueEmail,
} from './support/harness.js';
import './support/hooks.js';

/** BE-01-01 — provision a user. */

const app = createApp();

function validBody(overrides = {}) {
  return {
    email: uniqueEmail('provisioned'),
    name: 'Ada Lovelace',
    password: 'a-sufficiently-long-password',
    role: 'technician',
    ...overrides,
  };
}

describe('BE-01-01 — provision a user', () => {
  it('BE-01-01 AC-1 — a dispatcher provisioning a valid account gets 201 and the created user', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const body = validBody();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(body);

    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.body), ['user']);
    assert.deepEqual(Object.keys(res.body.user).sort(), ['email', 'id', 'name', 'role']);
    assert.equal(res.body.user.email, body.email);
    assert.equal(res.body.user.name, body.name);
    assert.equal(res.body.user.role, 'technician');

    // The role reached the database, not only the response.
    const stored = await User.findById(res.body.user.id);
    assert.equal(stored.role, 'technician');
    assert.equal(stored.active, true);
  });

  it('BE-01-01 AC-1 — the password is stored as a bcrypt hash at cost 12 and never in the clear', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const body = validBody();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(body);

    assert.equal(res.status, 201);

    const stored = await User.findById(res.body.user.id).select('+passwordHash');
    // $2<variant>$<cost>$ — the criterion is a modern KDF at bcrypt cost >= 12.
    const match = /^\$2[aby]\$(\d{2})\$/.exec(stored.passwordHash);
    assert.ok(match, `passwordHash is not a bcrypt hash: ${stored.passwordHash}`);
    assert.ok(Number(match[1]) >= 12, `bcrypt cost ${match[1]} is below the required 12`);
    assert.notEqual(stored.passwordHash, body.password);
    assert.ok(!stored.passwordHash.includes(body.password));
  });

  it('BE-01-01 AC-1 — no password field of any kind appears in the response', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const body = validBody();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(body);

    // Asserted against the whole serialised body, so a hash nested anywhere still fails.
    const raw = JSON.stringify(res.body);
    assert.doesNotMatch(raw, /password/i, 'the response mentions a password field');
    assert.ok(!raw.includes(body.password), 'the response echoes the plaintext password');
    assert.doesNotMatch(raw, /\$2[aby]\$/, 'the response contains a bcrypt hash');
  });

  it('BE-01-01 AC-2 — a duplicate email is refused with 409 and the standard envelope', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const existing = await seedUser({ role: 'technician' });

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ email: existing.email }));

    assert.equal(res.status, 409);
    assert.deepEqual(Object.keys(res.body), ['error']);
    assert.equal(res.body.error.code, 'email_in_use');
    assert.equal(typeof res.body.error.message, 'string');
  });

  it('BE-01-01 AC-2 — the conflict message reveals nothing about the account holding the address', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const existing = await seedUser({ role: 'dispatcher', name: 'Grace Hopper' });

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ email: existing.email }));

    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes('Grace Hopper'), 'the message names the existing account holder');
    assert.ok(!raw.includes(String(existing._id)), 'the message leaks the existing account id');
    assert.ok(!raw.includes('dispatcher'), 'the message leaks the existing account role');
  });

  it('BE-01-01 AC-2 — the check is case-insensitive, so a differently-cased duplicate is still 409', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const existing = await seedUser({ email: 'casing.test@example.test' });

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ email: existing.email.toUpperCase() }));

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'email_in_use');
    assert.equal(await User.countDocuments({}), 2, 'a second account was created for the same address');
  });

  it('BE-01-01 AC-3 — a role outside {dispatcher, technician} is refused with 400 naming the field', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ role: 'admin' }));

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
    assert.match(res.body.error.message, /role/, 'the 400 must name the invalid field');
    assert.equal(await User.countDocuments({ role: 'admin' }), 0);
  });

  it('BE-01-01 AC-3 — each declared validation rule is enforced with the real error code', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const cases = [
      { name: 'missing email', body: validBody({ email: undefined }), field: /email/ },
      { name: 'missing name', body: validBody({ name: undefined }), field: /name/ },
      { name: 'missing password', body: validBody({ password: undefined }), field: /password/ },
      { name: 'missing role', body: validBody({ role: undefined }), field: /role/ },
      { name: 'non-string email', body: validBody({ email: { $ne: null } }), field: /email/ },
      { name: 'password under the 12-character minimum', body: validBody({ password: 'short' }), field: /password/ },
      { name: 'name over the 120-character maximum', body: validBody({ name: 'x'.repeat(121) }), field: /name/ },
      { name: 'email over the 254-character maximum', body: validBody({ email: `${'x'.repeat(250)}@example.test` }), field: /email/ },
    ];

    for (const { name, body, field } of cases) {
      const res = await request(app)
        .post('/api/users')
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrf)
        .send(body);

      assert.equal(res.status, 400, `${name} should be a 400, got ${res.status}`);
      assert.equal(res.body.error.code, 'invalid_body', `${name} returned the wrong code`);
      assert.match(res.body.error.message, field, `${name} did not name the field`);
    }
  });

  it('BE-01-01 AC-3 — a password of exactly the 12-character minimum is accepted', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ password: 'x'.repeat(12) }));

    assert.equal(res.status, 201, 'the boundary value itself must be allowed');
  });

  it('BE-01-01 AC-4 — a technician provisioning any account is refused with 403', async () => {
    const { cookieHeader, csrf } = await asTechnician();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody());

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
    assert.equal(await User.countDocuments({ name: 'Ada Lovelace' }), 0, 'the account was created anyway');
  });

  it('BE-01-01 AC-4 — the refused attempt is audited with the actor, the action and a timestamp', async () => {
    const { user, cookieHeader, csrf } = await asTechnician();

    await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody());

    const entries = await AuditLog.find({ action: 'authorization.denied' });
    assert.equal(entries.length, 1, 'the denied attempt was not audited');
    assert.equal(String(entries[0].actor), String(user._id));
    assert.equal(entries[0].outcome, 'denied');
    assert.equal(entries[0].metadata.method, 'POST');
    assert.equal(entries[0].metadata.path, '/users');
    assert.deepEqual(entries[0].metadata.required, ['dispatcher']);
    assert.ok(entries[0].createdAt instanceof Date);
  });

  it('BE-01-01 AC-5 — extra fields in the body are ignored rather than written', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const injectedId = '0123456789abcdef01234567';
    const body = {
      ...validBody(),
      isAdmin: true,
      _id: injectedId,
      passwordHash: '$2b$12$injected.hash.that.must.never.be.stored.aaaaaaaaaaaaaaaaaaaaaaa',
      active: false,
      role: 'technician',
    };

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(body);

    assert.equal(res.status, 201);
    assert.notEqual(res.body.user.id, injectedId, 'the client chose its own _id');

    const stored = await User.findById(res.body.user.id).select('+passwordHash').lean();
    assert.equal(stored.isAdmin, undefined, 'isAdmin was written to the document');
    assert.notEqual(stored.passwordHash, body.passwordHash, 'the injected hash was stored');
    assert.equal(stored.active, true, 'a client-supplied `active` overrode the default');
    assert.equal(await User.countDocuments({ _id: injectedId }), 0);
  });

  it('BE-01-01 AC-5 — a dispatcher cannot escalate by injecting a role the validator did not allow', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ ...validBody(), role: ['dispatcher'] });

    assert.equal(res.status, 400, 'a non-string role must not be accepted');
    assert.equal(res.body.error.code, 'invalid_body');
  });

  it('BE-01-01 — the created account can be provisioned as a dispatcher too, not only a technician', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ role: 'dispatcher' }));

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'dispatcher');
  });

  it('BE-01-01 — provisioning writes one audit entry naming the new account as its target', async () => {
    const { user, cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ role: 'technician' }));

    const entries = await AuditLog.find({ action: 'user.provisioned' });
    assert.equal(entries.length, 1);
    assert.equal(String(entries[0].actor), String(user._id));
    assert.equal(entries[0].targetType, 'User');
    assert.equal(String(entries[0].targetId), res.body.user.id);
    assert.equal(entries[0].outcome, 'success');
    assert.equal(entries[0].metadata.role, 'technician');
  });
});
