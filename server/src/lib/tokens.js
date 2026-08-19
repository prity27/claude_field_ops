import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.accessSecret, {
    expiresIn: config.accessTtlSeconds,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.accessSecret);
}

/**
 * Refresh tokens are opaque random strings, not JWTs — a JWT is self-validating and could not
 * be revoked, which BE-01-03 AC-2 requires. Only the hash is persisted, so a database leak
 * does not hand over live sessions.
 */
export function mintRefreshToken() {
  const raw = crypto.randomBytes(48).toString('base64url');
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function newExpiry(seconds) {
  return new Date(Date.now() + seconds * 1000);
}
