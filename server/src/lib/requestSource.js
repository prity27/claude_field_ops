/**
 * One definition of "where did this request come from", used by both the rate limiter and the
 * audit trail. They must agree: a limiter that buckets by one value while the audit entry records
 * another makes a throttled source impossible to trace back to the attempts that throttled it.
 *
 * `req.ip` already honours `trust proxy` when it is configured, so this deliberately does not
 * read `X-Forwarded-For` itself — a spoofable header read behind an untrusted proxy is worse than
 * a socket address that is merely imprecise.
 */
export function clientSource(req) {
  return req?.ip ?? null;
}
