import { AuditLog } from '../models/AuditLog.js';

/**
 * The single append point for the audit trail (BE-01-08). Nothing else writes AuditLog, and
 * nothing anywhere updates or deletes it.
 *
 * An audit write must never fail the operation it is recording — a denied request that also
 * 500s because logging broke is worse than a denied request. Failures are logged and swallowed.
 */
export async function record({ actor, action, targetType, targetId, outcome, source, metadata }) {
  try {
    await AuditLog.create({
      actor: actor ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      outcome,
      // An IP is not contact detail in the AC-3 sense — it identifies an origin, not a person —
      // but it is still the only field here that comes from the network, so it is stored on its
      // own column rather than mixed into free-form metadata.
      source: source ?? null,
      // BE-01-08 AC-3: no PII, no tokens. Callers pass identifiers, never contact details.
      metadata: metadata ?? {},
    });
  } catch (err) {
    console.error('audit write failed', { action, outcome, err: err.message });
  }
}
