import { AppError } from './errorHandler.js';

/**
 * Whitelisting request input, in one place. Every write route uses it.
 *
 * The rule it enforces is OWASP A03: a raw request body must never reach a model
 * constructor. Passing `req.body` straight to `Model.create` is how `isAdmin: true` or a
 * client-chosen `status` gets written, and it is invisible in review unless someone is
 * specifically looking for it.
 *
 * spec: { field: { required?, type?, enum?, maxLength?, minLength?, min?, max?, clamp?, default? } }
 */
export function validateBody(spec) {
  return function validateBodyMiddleware(req, res, next) {
    const result = whitelist(spec, req.body ?? {});
    if (result.error) return next(result.error);
    req.validated = result.clean;
    return next();
  };
}

/**
 * The same whitelist, over the query string.
 *
 * Query values always arrive as strings, so an `integer` or `boolean` rule here coerces rather
 * than type-checks. `clamp` exists for the same reason: BE-02-03 AC-5 requires a page size above
 * the maximum to be *capped*, not rejected and not honoured, and a rule that can only reject
 * cannot express that.
 *
 * The result lands on `req.validatedQuery` rather than overwriting `req.query`, mirroring the way
 * `validateBody` leaves `req.body` alone.
 */
export function validateQuery(spec) {
  return function validateQueryMiddleware(req, res, next) {
    const result = whitelist(spec, req.query ?? {});
    if (result.error) return next(result.error);
    req.validatedQuery = result.clean;
    return next();
  };
}

/**
 * Fields a route refuses outright, as against the ones it silently drops.
 *
 * Dropping is right when an extra field is noise — BE-02-01 AC-4 wants `_id` and `createdAt`
 * ignored. It is wrong when the field is real and owned by a different endpoint: silently
 * ignoring `archived` on an update would let a caller believe they had archived a customer when
 * nothing happened (BE-02-04 AC-2).
 */
export function rejectFields(...fields) {
  return function rejectFieldsMiddleware(req, res, next) {
    const body = req.body ?? {};
    const offender = fields.find((field) => Object.hasOwn(body, field));
    if (offender) {
      return next(
        new AppError(400, 'invalid_body', `${offender} cannot be set through this endpoint`),
      );
    }
    return next();
  };
}

function whitelist(spec, source) {
  const clean = {};

  for (const [field, rule] of Object.entries(spec)) {
    const value = source[field];

    if (value === undefined || value === null || value === '') {
      if (rule.required) {
        return { error: new AppError(400, 'invalid_body', `${field} is required`) };
      }
      if (rule.default !== undefined) clean[field] = rule.default;
      continue;
    }

    if (rule.type === 'string' && typeof value !== 'string') {
      return { error: new AppError(400, 'invalid_body', `${field} must be a string`) };
    }
    if (rule.enum && !rule.enum.includes(value)) {
      return {
        error: new AppError(400, 'invalid_body', `${field} must be one of: ${rule.enum.join(', ')}`),
      };
    }
    if (rule.minLength && String(value).length < rule.minLength) {
      return {
        error: new AppError(
          400,
          'invalid_body',
          `${field} must be at least ${rule.minLength} characters`,
        ),
      };
    }
    if (rule.maxLength && String(value).length > rule.maxLength) {
      return {
        error: new AppError(
          400,
          'invalid_body',
          `${field} must be at most ${rule.maxLength} characters`,
        ),
      };
    }

    if (rule.type === 'integer') {
      const coerced = coerceInteger(field, rule, value);
      if (coerced.error) return coerced;
      clean[field] = coerced.value;
      continue;
    }
    if (rule.type === 'boolean') {
      const coerced = coerceBoolean(field, value);
      if (coerced.error) return coerced;
      clean[field] = coerced.value;
      continue;
    }

    clean[field] = value;
  }

  // Anything not in the spec is dropped here and cannot reach a handler.
  return { clean };
}

function coerceInteger(field, rule, value) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    return { error: new AppError(400, 'invalid_body', `${field} must be a whole number`) };
  }

  const belowMin = rule.min !== undefined && number < rule.min;
  const aboveMax = rule.max !== undefined && number > rule.max;

  if (!rule.clamp && (belowMin || aboveMax)) {
    const bound = belowMin ? `at least ${rule.min}` : `at most ${rule.max}`;
    return { error: new AppError(400, 'invalid_body', `${field} must be ${bound}`) };
  }
  if (belowMin) return { value: rule.min };
  if (aboveMax) return { value: rule.max };
  return { value: number };
}

function coerceBoolean(field, value) {
  if (value === true || value === 'true') return { value: true };
  if (value === false || value === 'false') return { value: false };
  return { error: new AppError(400, 'invalid_body', `${field} must be true or false`) };
}
