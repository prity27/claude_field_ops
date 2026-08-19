import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { hashPassword, verifyPassword, burnVerificationTime } from '../lib/password.js';
import { signAccessToken, mintRefreshToken, hashRefreshToken, newExpiry } from '../lib/tokens.js';
import { sendPasswordResetLink } from '../lib/mailer.js';
import * as audit from './audit.service.js';

// BE-01-02 AC-2: unknown email, wrong password and deactivated account are indistinguishable.
// One constant, used for all three, so no future edit can accidentally split them apart.
const LOGIN_FAILED = () => new AppError(401, 'invalid_credentials', 'Invalid email or password');

export async function login(email, password) {
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');

  if (!user) {
    // Burn comparable time so a missing account cannot be detected by response latency.
    await burnVerificationTime();
    await audit.record({ action: 'login.failure', outcome: 'denied', metadata: { reason: 'no_user' } });
    throw LOGIN_FAILED();
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.active) {
    await audit.record({
      actor: user._id,
      action: 'login.failure',
      outcome: 'denied',
      metadata: { reason: ok ? 'inactive' : 'bad_password' },
    });
    throw LOGIN_FAILED();
  }

  const tokens = await issueSession(user);
  await audit.record({ actor: user._id, action: 'login.success', outcome: 'success' });
  return { user: publicUser(user), ...tokens };
}

async function issueSession(user) {
  const refresh = mintRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: refresh.hash,
    expiresAt: newExpiry(config.refreshTtlSeconds),
  });
  return {
    accessToken: signAccessToken(user),
    refreshToken: refresh.raw,
    csrfToken: crypto.randomBytes(24).toString('base64url'),
  };
}

export async function refresh(rawToken) {
  if (!rawToken) throw new AppError(401, 'invalid_refresh_token', 'Refresh token missing or invalid');

  const stored = await RefreshToken.findOne({ tokenHash: hashRefreshToken(rawToken) });
  // BE-01-03 AC-3: revoked and expired are both simply invalid.
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    throw new AppError(401, 'invalid_refresh_token', 'Refresh token missing or invalid');
  }

  const user = await User.findById(stored.user);
  if (!user || !user.active) {
    throw new AppError(401, 'invalid_refresh_token', 'Refresh token missing or invalid');
  }

  return { accessToken: signAccessToken(user) };
}

export async function logout(rawToken) {
  if (!rawToken) return; // Logging out without a session is not an error.
  await RefreshToken.updateOne(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: String(email).toLowerCase() });

  // BE-01-04 AC-1: the response is identical whether or not the account exists, so the caller
  // returns before knowing. Only the side effect differs.
  if (user && user.active) {
    const raw = crypto.randomBytes(32).toString('base64url');
    await PasswordResetToken.create({
      user: user._id,
      tokenHash: hashRefreshToken(raw),
      expiresAt: newExpiry(config.passwordResetTtlSeconds),
    });
    await sendPasswordResetLink(user.email, raw);
  }
}

export async function completePasswordReset(rawToken, newPassword) {
  const stored = await PasswordResetToken.findOne({ tokenHash: hashRefreshToken(rawToken) });
  if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
    throw new AppError(400, 'invalid_reset_token', 'This reset link is invalid or has expired');
  }

  const user = await User.findById(stored.user);
  if (!user) throw new AppError(400, 'invalid_reset_token', 'This reset link is invalid or has expired');

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  // Single-use (AC-2), and every existing session dies with the password (AC-3).
  stored.usedAt = new Date();
  await stored.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

  await audit.record({ actor: user._id, action: 'password.reset', outcome: 'success' });
}

export function publicUser(user) {
  return { id: String(user._id), email: user.email, name: user.name, role: user.role };
}
