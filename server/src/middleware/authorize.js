import { AppError } from './errorHandler.js';
import * as audit from '../services/audit.service.js';

/**
 * BE-01-06 AC-2: a route's permission is declared AT the route, readable without opening the
 * handler. Security that lives inside a handler is security nobody reviews.
 */
/**
 * The other kind of role question: not "may this route run at all", which `requireRole` answers
 * and refuses, but "how much of a collection may this actor see" — the row scoping in
 * BE-02-02 AC-3, where a technician gets a smaller answer rather than a 403.
 *
 * It lives here, next to `requireRole`, so that this module stays the only place in `src/` that
 * compares a role to a string (BE-01-06 AC-1). A service that hand-rolled the comparison would be
 * a second authorization model, which is exactly what that criterion exists to prevent.
 */
export function hasRole(actor, role) {
  return actor?.role === role;
}

export function requireRole(...roles) {
  return async function requireRoleMiddleware(req, res, next) {
    if (!req.actor) {
      return next(new AppError(401, 'unauthenticated', 'Authentication required'));
    }
    if (!roles.includes(req.actor.role)) {
      await audit.record({
        actor: req.actor.id,
        action: 'authorization.denied',
        targetType: 'route',
        outcome: 'denied',
        metadata: { method: req.method, path: req.path, required: roles },
      });
      return next(new AppError(403, 'forbidden', 'You do not have permission to do that'));
    }
    return next();
  };
}
