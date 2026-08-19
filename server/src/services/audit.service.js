import { AuditLog } from '../models/AuditLog.js';

/**
 * The single append point for the audit trail (BE-01-08). Nothing else writes AuditLog, and
 * nothing anywhere updates or deletes it.
 *
 * An audit write must never fail the operation it is recording — a denied request that also
 * 500s because logging broke is worse than a denied request. Failures are logged and swallowed.
 */
export async function record({ actor, action, targetType, targetId, outcome, metadata }) {
  try {
    await AuditLog.create({
      actor: actor ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      outcome,
      // BE-01-08 AC-3: no PII, no tokens. Callers pass identifiers, never contact details.
      metadata: metadata ?? {},
    });
  } catch (err) {
    console.error('audit write failed', { action, outcome, err: err.message });
  }
}
