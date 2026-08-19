import { verifyAccessToken } from '../lib/tokens.js';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { AppError } from './errorHandler.js';

/**
 * BE-01-05: authentication is the default. This is mounted once, ahead of the routers, and a
 * route becomes public only by appearing in the opt-out list in app.js.
 *
 * A default-open router means every future forgotten route is a vulnerability; a default-
 * closed one means the worst case is a 401 someone notices immediately.
 */
export function authenticate(req, res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) {
    return next(new AppError(401, 'unauthenticated', 'Authentication required'));
  }

  try {
    const claims = verifyAccessToken(token);
    req.actor = { id: claims.sub, role: claims.role };
    return next();
  } catch {
    return next(new AppError(401, 'unauthenticated', 'Authentication required'));
  }
}
