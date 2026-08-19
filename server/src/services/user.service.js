import { User } from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import { hashPassword } from '../lib/password.js';
import { publicUser } from './auth.service.js';
import * as audit from './audit.service.js';

/**
 * BE-01-01. Only these fields are ever read from a request body — the whitelist lives here
 * rather than in the router so that no future caller can bypass it (AC-5).
 */
export async function provision({ email, name, password, role }, actor) {
  const normalised = String(email).toLowerCase();

  const existing = await User.findOne({ email: normalised });
  if (existing) {
    // AC-2: the conflict is reported, but nothing about the existing account is.
    throw new AppError(409, 'email_in_use', 'That email address is already registered');
  }

  const user = await User.create({
    email: normalised,
    name,
    role,
    passwordHash: await hashPassword(password),
  });

  await audit.record({
    actor: actor.id,
    action: 'user.provisioned',
    targetType: 'User',
    targetId: user._id,
    outcome: 'success',
    metadata: { role },
  });

  return publicUser(user);
}
