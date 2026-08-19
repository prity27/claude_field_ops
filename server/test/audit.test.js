import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import request from 'supertest';
import { AUDIT_ACTIONS, AuditLog } from '../src/models/AuditLog.js';
import {
  PASSWORD,
  asDispatcher,
  asTechnician,
  createApp,
  login,
  seedResetToken,
  seedUser,
  uniqueEmail,
} from './support/harness.js';
import './support/hooks.js';

/** BE-01-08 — audit trail for sensitive actions. */

const app = createApp();
const SRC = new URL('../src/', import.meta.url);

function sourceFiles(dir = SRC, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) sourceFiles(child, found);
    else if (entry.name.endsWith('.js')) {
      found.push({ path: child.href.split('/src/')[1], text: readFileSync(child, 'utf8') });
    }
  }
  return found;
}

describe('BE-01-08 AC-1 — the actions that exist are audited with actor, target, action and timestamp', () => {
  it('BE-01-08 AC-1 — a login success is audited', async () => {
    const user = await seedUser({ role: 'dispatcher' });

    await login(app, request, user.email, PASSWORD);

    const [entry] = await AuditLog.find({ action: 'login.success' });
    assert.ok(entry, 'a successful login was not audited');
    assert.equal(String(entry.actor), String(user._id));
    assert.equal(entry.outcome, 'success');
    assert.ok(entry.createdAt instanceof Date);
  });

  it('BE-01-08 AC-1 — a login failure is audited', async () => {
    const user = await seedUser({ role: 'technician' });

    await login(app, request, user.email, 'the-wrong-password');

    const [entry] = await AuditLog.find({ action: 'login.failure' });
    assert.ok(entry, 'a failed login was not audited');
    assert.equal(String(entry.actor), String(user._id));
    assert.equal(entry.outcome, 'denied');
    assert.ok(entry.createdAt instanceof Date);
  });

  it('BE-01-08 AC-1 — an authorization failure is audited with its target route', async () => {
    const { user, cookieHeader, csrf } = await asTechnician();

    await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ email: uniqueEmail('nope'), name: 'Nope', password: 'a-long-enough-password', role: 'technician' });

    const [entry] = await AuditLog.find({ action: 'authorization.denied' });
    assert.ok(entry, 'an authorization failure was not audited');
    assert.equal(String(entry.actor), String(user._id));
    assert.equal(entry.targetType, 'route');
    assert.ok(entry.createdAt instanceof Date);
  });

  it('BE-01-08 AC-1 — provisioning an account is audited with the new account as its target', async () => {
    const { user, cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ email: uniqueEmail('new'), name: 'New Hire', password: 'a-long-enough-password', role: 'technician' });

    const [entry] = await AuditLog.find({ action: 'user.provisioned' });
    assert.ok(entry, 'provisioning was not audited');
    assert.equal(String(entry.actor), String(user._id));
    assert.equal(entry.targetType, 'User');
    assert.equal(String(entry.targetId), res.body.user.id);
    assert.ok(entry.createdAt instanceof Date);
  });

  it('BE-01-08 AC-1 — a password reset is audited', async () => {
    const user = await seedUser();
    const token = await seedResetToken(user);

    await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: 'a-replacement-long-password' });

    const [entry] = await AuditLog.find({ action: 'password.reset' });
    assert.ok(entry, 'a password reset was not audited');
    assert.equal(String(entry.actor), String(user._id));
    assert.ok(entry.createdAt instanceof Date);
  });

  it('BE-01-08 AC-1 — every action the model declares is spelled the same way in the code that writes it', () => {
    // The remaining actions in AUDIT_ACTIONS belong to epics that are not built yet. This asserts
    // that no service writes an action the model would reject, which is the failure mode that
    // would silently drop an audit entry — audit.service.js swallows its own write errors.
    const written = new Set();
    for (const { text } of sourceFiles()) {
      for (const match of text.matchAll(/action:\s*'([^']+)'/g)) written.add(match[1]);
    }

    const unknown = [...written].filter((action) => !AUDIT_ACTIONS.includes(action));
    assert.deepEqual(unknown, [], 'a service writes an audit action the model does not allow');
    assert.ok(written.size > 0, 'no audit actions were found in the source at all');
  });
});

describe('BE-01-08 AC-2 — the trail cannot be altered or deleted through any API surface', () => {
  it('BE-01-08 AC-2 — no route reads, updates or deletes the audit log', async () => {
    // Behavioural: there is no audit endpoint to reach.
    const { cookieHeader } = await asDispatcher();
    for (const path of ['/api/audit', '/api/audit-log', '/api/auditlogs']) {
      const res = await request(app).get(path).set('Cookie', cookieHeader);
      assert.equal(res.status, 404, `${path} is reachable`);
    }

    // Structural: only the single append point imports the model at all.
    const importers = sourceFiles()
      .filter(({ text }) => /from '.*models\/AuditLog\.js'/.test(text))
      .map(({ path }) => path);
    assert.deepEqual(
      importers.sort(),
      ['services/audit.service.js'],
      'something other than the audit service imports the AuditLog model',
    );
  });

  it('BE-01-08 AC-2 — the audit service only ever appends: no update or delete call exists', () => {
    const service = readFileSync(new URL('services/audit.service.js', SRC), 'utf8');

    assert.match(service, /AuditLog\.create\(/, 'the append point is not a create');
    for (const forbidden of [
      /AuditLog\.(update|replace|delete|remove|findOneAndUpdate|findOneAndDelete|findByIdAndUpdate|findByIdAndDelete|bulkWrite)/,
      /\.save\(/,
    ]) {
      assert.doesNotMatch(service, forbidden, `the audit service can mutate the trail: ${forbidden}`);
    }
  });

  it('BE-01-08 AC-2 — the model records no updatedAt, so an entry has no mutation path even in principle', async () => {
    const user = await seedUser();
    await login(app, request, user.email, PASSWORD);

    const entry = await AuditLog.findOne({ action: 'login.success' }).lean();
    assert.ok(entry.createdAt, 'entries must carry a creation timestamp');
    assert.equal(entry.updatedAt, undefined, 'an updatedAt field implies entries are updated');
  });
});

describe('BE-01-08 AC-3 — no entry carries a password, a token or full contact detail', () => {
  it('BE-01-08 AC-3 — a full flow of audited actions leaks no credential or contact detail into the trail', async () => {
    // Drive every audited action that exists, then read the whole trail back and look for
    // anything that should never be in it.
    const dispatcher = await asDispatcher();
    const failedLoginUser = await seedUser({ role: 'technician' });
    const resetUser = await seedUser({ role: 'technician' });
    const resetToken = await seedResetToken(resetUser);
    const newAccountEmail = uniqueEmail('provisioned');
    const newAccountPassword = 'another-long-enough-password';

    await login(app, request, dispatcher.user.email, PASSWORD);            // login.success
    await login(app, request, failedLoginUser.email, 'wrong-password');    // login.failure
    await request(app)                                                     // user.provisioned
      .post('/api/users')
      .set('Cookie', dispatcher.cookieHeader)
      .set('x-csrf-token', dispatcher.csrf)
      .send({ email: newAccountEmail, name: 'New Hire', password: newAccountPassword, role: 'technician' });
    await request(app)                                                     // password.reset
      .post('/api/auth/password-reset/complete')
      .send({ token: resetToken, password: 'yet-another-long-password' });

    const technician = await asTechnician();
    await request(app)                                                     // authorization.denied
      .post('/api/users')
      .set('Cookie', technician.cookieHeader)
      .set('x-csrf-token', technician.csrf)
      .send({ email: uniqueEmail('nope'), name: 'Nope', password: 'a-long-enough-password', role: 'technician' });

    const entries = await AuditLog.find({}).lean();
    assert.ok(entries.length >= 5, `expected the whole flow to be audited, saw ${entries.length}`);
    const trail = JSON.stringify(entries);

    const mustNotAppear = {
      'the shared test password': PASSWORD,
      'a provisioned password': newAccountPassword,
      'a raw reset token': resetToken,
      'the CSRF token': dispatcher.csrf,
      'an access token': dispatcher.access,
      "the dispatcher's email address": dispatcher.user.email,
      "a provisioned account's email address": newAccountEmail,
      "the reset user's email address": resetUser.email,
    };
    for (const [what, value] of Object.entries(mustNotAppear)) {
      assert.ok(!trail.includes(value), `the audit trail contains ${what}`);
    }

    // And no bcrypt hash, however it got there.
    assert.doesNotMatch(trail, /\$2[aby]\$\d{2}\$/, 'the audit trail contains a password hash');
    assert.doesNotMatch(trail, /@example\.test/, 'the audit trail contains an email address');
  });

  it('BE-01-08 AC-3 — an audit write that fails does not fail the operation it was recording', async () => {
    // audit.service.js swallows its own errors deliberately: a denied request that also 500s
    // because logging broke is worse than a denied request. Proven by writing an action the
    // model's enum rejects — the create throws, and the caller is unaffected.
    const audit = await import('../src/services/audit.service.js');

    await audit.record({ action: 'not-a-declared-action', outcome: 'success' });

    assert.equal(await AuditLog.countDocuments({}), 0, 'an invalid entry was written');
  });
});
