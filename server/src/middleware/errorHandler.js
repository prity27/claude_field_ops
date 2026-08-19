import { isProduction } from '../config/env.js';

/**
 * A domain error carries the status the API should return. Anything else is a 500,
 * and its message is withheld in production so internals do not leak to a client.
 */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars -- Express identifies an error handler by arity
export function errorHandler(err, req, res, next) {
  const status = err instanceof AppError ? err.status : 500;
  const code = err instanceof AppError ? err.code : 'internal_error';
  const message = status === 500 && isProduction ? 'Internal server error' : err.message;

  if (status === 500) console.error(err);

  res.status(status).json({ error: { code, message } });
}
