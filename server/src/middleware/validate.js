import { AppError } from './errorHandler.js';

/**
 * Whitelisting request bodies, in one place. Every write route uses it.
 *
 * The rule it enforces is OWASP A03: a raw request body must never reach a model
 * constructor. Passing `req.body` straight to `Model.create` is how `isAdmin: true` or a
 * client-chosen `status` gets written, and it is invisible in review unless someone is
 * specifically looking for it.
 *
 * spec: { field: { required?, type?, enum?, maxLength?, minLength? } }
 */
export function validateBody(spec) {
  return function validateBodyMiddleware(req, res, next) {
    const body = req.body ?? {};
    const clean = {};

    for (const [field, rule] of Object.entries(spec)) {
      const value = body[field];

      if (value === undefined || value === null || value === '') {
        if (rule.required) return next(new AppError(400, 'invalid_body', `${field} is required`));
        continue;
      }
      if (rule.type === 'string' && typeof value !== 'string') {
        return next(new AppError(400, 'invalid_body', `${field} must be a string`));
      }
      if (rule.enum && !rule.enum.includes(value)) {
        return next(
          new AppError(400, 'invalid_body', `${field} must be one of: ${rule.enum.join(', ')}`),
        );
      }
      if (rule.minLength && String(value).length < rule.minLength) {
        return next(
          new AppError(400, 'invalid_body', `${field} must be at least ${rule.minLength} characters`),
        );
      }
      if (rule.maxLength && String(value).length > rule.maxLength) {
        return next(
          new AppError(400, 'invalid_body', `${field} must be at most ${rule.maxLength} characters`),
        );
      }
      clean[field] = value;
    }

    // Anything not in the spec is dropped here and cannot reach a handler.
    req.validated = clean;
    return next();
  };
}
