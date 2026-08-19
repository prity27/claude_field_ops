import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { RefreshToken } from '../../src/models/RefreshToken.js';
import { PasswordResetToken } from '../../src/models/PasswordResetToken.js';
import { config } from '../../src/config/env.js';
import {
  hashRefreshToken,
  mintRefreshToken,
  newExpiry,
  signAccessToken,
} from '../../src/lib/tokens.js';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '../../src/lib/cookies.js';

/**
 * A real Express app over a real MongoDB.
 *
 * Chosen at the /write-tests gate on 2026-08-19 over mocking Mongoose, because most of what this
 * epic has to prove is database behaviour: a unique-index conflict (BE-01-01 AC-2), `select:
 * false` keeping a hash out of a response (AC-1), server-side refresh revocation that a stateless
 * token could not provide (BE-01-03 AC-2). A mocked model proves none of those.
 *
 * test/run.js starts the replica set; this connects to it in a database of its own, so files
 * running in parallel cannot see each other's rows.
 */

export { createApp };
export { config };

export async function startDb() {
  const uri = process.env.MONGODB_TEST_URI;
  if (!uri) throw new Error('MONGODB_TEST_URI is not set — run the suite through `npm test`.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: `fieldops_test_${process.pid}` });
}

export async function stopDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

/**
 * Every test builds its own data. Nothing is shared and mutated across a file, because shared
 * fixtures produce order dependence and order dependence produces the flake that gets a suite
 * switched off.
 */
export async function resetDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

// ---------------------------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------------------------

export const PASSWORD = 'correct-horse-battery-staple';

/**
 * bcrypt at cost 12 costs ~200ms per hash by design (lib/password.js:5). Hashing the one shared
 * test password once, here, keeps that cost off every seeding call. It is a constant, not
 * mutable shared state.
 *
 * The tests that must prove the hashing itself — BE-01-01 AC-1 — go through the real endpoint
 * and never touch this.
 */
const SEEDED_HASH = bcrypt.hashSync(PASSWORD, 12);

export function uniqueEmail(label = 'user') {
  return `${label}.${crypto.randomBytes(6).toString('hex')}@example.test`;
}

export async function seedUser({ role = 'dispatcher', active = true, email, name } = {}) {
  return User.create({
    email: email ?? uniqueEmail(role),
    name: name ?? `Test ${role}`,
    role,
    active,
    passwordHash: SEEDED_HASH,
  });
}

export async function seedRefreshToken(user, { expiresAt, revokedAt = null } = {}) {
  const token = mintRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: token.hash,
    expiresAt: expiresAt ?? newExpiry(config.refreshTtlSeconds),
    revokedAt,
  });
  return token.raw;
}

export async function seedResetToken(user, { expiresAt, usedAt = null } = {}) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await PasswordResetToken.create({
    user: user._id,
    tokenHash: hashRefreshToken(raw),
    expiresAt: expiresAt ?? newExpiry(config.passwordResetTtlSeconds),
    usedAt,
  });
  return raw;
}

// ---------------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------------

/**
 * Builds a signed session for a seeded user without going through POST /api/auth/login.
 *
 * The token is minted by the server's own `signAccessToken`, so nothing about authentication or
 * authorization is bypassed — the request still passes `authenticate` and `requireRole` for real.
 * What it avoids is spending the login route's rate-limit budget, and ~400ms of bcrypt, in the
 * many tests whose subject is not logging in.
 *
 * Tests that are about logging in use `login()` below and exercise the endpoint.
 */
export function sessionFor(user, { csrf } = {}) {
  const csrfToken = csrf ?? crypto.randomBytes(16).toString('base64url');
  return {
    csrf: csrfToken,
    access: signAccessToken(user),
    cookieHeader: `${ACCESS_COOKIE}=${signAccessToken(user)}; ${CSRF_COOKIE}=${csrfToken}`,
  };
}

export async function asDispatcher(opts = {}) {
  const user = await seedUser({ role: 'dispatcher', ...opts });
  return { user, ...sessionFor(user) };
}

export async function asTechnician(opts = {}) {
  const user = await seedUser({ role: 'technician', ...opts });
  return { user, ...sessionFor(user) };
}

// ---------------------------------------------------------------------------------------------
// Cookie reading
// ---------------------------------------------------------------------------------------------

export function setCookies(res) {
  return (res.headers['set-cookie'] ?? []).map((line) => {
    const [pair, ...attrs] = line.split(';').map((s) => s.trim());
    const eq = pair.indexOf('=');
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      httpOnly: attrs.some((a) => a.toLowerCase() === 'httponly'),
      sameSite: attrs.find((a) => a.toLowerCase().startsWith('samesite='))?.split('=')[1],
      maxAge: Number(
        attrs.find((a) => a.toLowerCase().startsWith('max-age='))?.split('=')[1] ?? NaN,
      ),
      attrs,
    };
  });
}

export function cookie(res, name) {
  return setCookies(res).find((c) => c.name === name);
}

/**
 * Logs in through the real endpoint. Cookies are replayed by hand rather than with supertest's
 * agent, so a test can deliberately send a session *without* its CSRF token — which is the whole
 * of BE-01-09 AC-1.
 */
export async function login(app, request, email, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  const jar = setCookies(res);
  return {
    res,
    cookieHeader: jar.map((c) => `${c.name}=${c.value}`).join('; '),
    csrf: jar.find((c) => c.name === CSRF_COOKIE)?.value,
    access: jar.find((c) => c.name === ACCESS_COOKIE)?.value,
    refresh: jar.find((c) => c.name === REFRESH_COOKIE)?.value,
  };
}

export { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE };
