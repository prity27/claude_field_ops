import { isProduction } from '../config/env.js';

/**
 * Pluggable out-of-band delivery. PROFILE.md records no mail transport, so the only
 * implementation logs the link (build gate, 2026-08-19). Swapping in a real provider is a
 * change to this file alone.
 *
 * It throws in production rather than silently not delivering a reset link.
 */
export async function sendPasswordResetLink(email, token) {
  if (isProduction) {
    throw new Error(
      'No mail transport is configured. Password reset cannot be delivered in production.',
    );
  }
  console.log(`[mailer] password reset for ${email}: /reset-password?token=${token}`);
}
