import mongoose from 'mongoose';

export const AUDIT_ACTIONS = [
  'login.success',
  'login.failure',
  'password.reset',
  'authorization.denied',
  'user.provisioned',
  'user.role_changed',
  'technician.deactivated',
  'customer.archived',
  'job.cancelled',
  'job.reopened',
  'invoice.voided',
];

/**
 * Append-only record of sensitive actions (BE-01-08). No update or delete path exists at any
 * layer — that is the point of it.
 *
 * metadata must never carry PII, a password or a token. An audit trail that leaks the thing
 * it was meant to protect is worse than none.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, enum: AUDIT_ACTIONS },
    targetType: { type: String, default: null },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    outcome: { type: String, required: true, enum: ['success', 'denied'] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
