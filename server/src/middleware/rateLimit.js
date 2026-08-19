import { AppError } from './errorHandler.js';
import { clientSource } from '../lib/requestSource.js';

/**
 * BE-01-02 AC-3: login attempts are rate-limited.
 *
 * Deliberately in-process and dependency-free. The honest caveat, recorded rather than
 * discovered: this counts per Node process, so running more than one instance behind a load
 * balancer multiplies the effective limit by the instance count. That is acceptable for a
 * single-process deployment and must be replaced with a shared store (Redis) before scaling
 * horizontally — see PROFILE.md.
 */
export function rateLimit({ windowMs, max, key = clientSource }) {
  const hits = new Map();

  // Sweep expired buckets so the map cannot grow without bound on a long-running process.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, bucket] of hits) if (bucket.resetAt <= now) hits.delete(k);
  }, windowMs).unref();
  sweep;

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const k = key(req);
    const bucket = hits.get(k);

    if (!bucket || bucket.resetAt <= now) {
      hits.set(k, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return next(
        new AppError(429, 'too_many_requests', 'Too many attempts. Try again shortly.'),
      );
    }
    return next();
  };
}
