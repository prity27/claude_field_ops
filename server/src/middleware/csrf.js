import { CSRF_COOKIE } from '../lib/cookies.js';
import { AppError } from './errorHandler.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF check.
 *
 * Required by the decision to keep both tokens in httpOnly cookies (build gate, 2026-08-19):
 * cookies are sent automatically by the browser, so without this any site could trigger a
 * state-changing request on a signed-in user's behalf. The client reads the non-httpOnly CSRF
 * cookie and echoes it in this header; a cross-origin page cannot read the cookie, so it
 * cannot produce the header.
 *
 * SameSite=Strict already blocks most of this. It is defence in depth, not a replacement.
 */
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new AppError(403, 'csrf_failed', 'Missing or invalid CSRF token'));
  }
  return next();
}
