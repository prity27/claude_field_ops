import mongoose from 'mongoose';

export const SLOTS = ['morning', 'afternoon', 'evening'];

/**
 * Binds one job to one technician for one slot on one business day.
 *
 * `date` is a plain YYYY-MM-DD string in the single operating timezone (SCHEMA.md gate,
 * 2026-08-19) — not a Date. Storing an instant would make "morning of the 20th" shift by
 * timezone and the uniqueness key below would stop meaning anything.
 */
const assignmentSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    technician: { type: mongoose.Schema.Types.ObjectId, ref: 'Technician', required: true },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD in the operating timezone'],
    },
    slot: { type: String, required: true, enum: SLOTS },
    status: { type: String, required: true, enum: ['active', 'superseded'], default: 'active' },
    supersededAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// THE INVARIANT. A technician cannot hold two active assignments for the same slot.
//
// partialFilterExpression is correctness, not optimisation: reassignment supersedes rather
// than overwrites, so superseded rows keep their key. A plain unique index would count them
// and that technician's slot would be unusable forever (BE-05-02 AC-3).
//
// Enforcement is the index itself, not a read-then-write check in the service — two
// dispatchers assigning concurrently both read "free" before either writes.
assignmentSchema.index(
  { technician: 1, date: 1, slot: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

// The availability grid: one query for a whole day, never one per technician (BE-05-04 AC-3).
assignmentSchema.index({ technician: 1, date: 1 });
// Find a job's active assignment.
assignmentSchema.index({ job: 1, status: 1 });

export const Assignment = mongoose.model('Assignment', assignmentSchema);
