import mongoose from 'mongoose';

/**
 * A record, never an account — customers do not log in (dec-no-customer-login, interview 2.4).
 *
 * siteAddress, contactPhone and contactEmail are PII. They must never reach a log line
 * (INF-00-06 AC-3) or an audit entry. Retention is unset: q-pii-retention is still open.
 */
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    siteAddress: { type: String, required: true, trim: true, maxlength: 500 },
    contactPhone: { type: String, trim: true, maxlength: 40, default: null },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
    archived: { type: Boolean, required: true, default: false },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Default list: not archived, sorted by name.
customerSchema.index({ archived: 1, name: 1 });

export const Customer = mongoose.model('Customer', customerSchema);
