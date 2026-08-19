import { AppError } from './errorHandler.js';
import * as audit from '../services/audit.service.js';

/**
 * BE-01-06 AC-2: a route's permission is declared AT the route, readable without opening the
 * handler. Security that lives inside a handler is security nobody reviews.
 */
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
