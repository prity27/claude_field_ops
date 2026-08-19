import mongoose from 'mongoose';

export const JOB_STATUSES = [
  'raised',
  'scheduled',
  'dispatched',
  'in_progress',
  'completed',
  'invoiced',
  'cancelled',
];

/**
 * The centre of the domain. Transitions are ordered and role-gated — see
 * docs/delivery/stories/04-job-lifecycle-backend.md. status is never client-settable.
 */
const jobSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      required: true,
      enum: JOB_STATUSES,
      default: 'raised',
      index: true,
    },

    // Denormalized from the active Assignment (SCHEMA.md gate, 2026-08-19). It exists so a
    // technician's job list is one lookup rather than a join on the hottest path in the app.
    //
    // It MUST be written inside the same transaction as every assignment change — assign,
    // reassign, unschedule, cancel, and the deactivation cascade. If it drifts, a technician
    // sees a job that is not theirs, which is precisely the IDOR failure BE-01-07 prevents.
    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Technician',
      default: null,
    },

    startedAt: { type: Date, default: null },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completionNotes: { type: String, trim: true, maxlength: 4000, default: null },

    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Conditionally required: a cancelled job without a reason is not permitted (interview 9.2).
    // Enforcing this in the service alone would let a direct database write produce one.
    cancelledReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
      required: function required() {
        return this.status === 'cancelled';
      },
    },

    reopenedAt: { type: Date, default: null },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reopenedReason: { type: String, trim: true, maxlength: 1000, default: null },
  },
  { timestamps: true },
);

// Default board list, with _id breaking ties so pages cannot reshuffle between requests.
jobSchema.index({ status: 1, createdAt: -1, _id: -1 });
// Technician queue scoping.
jobSchema.index({ assignedTechnician: 1, status: 1 });
// The open-job check that blocks archiving a customer (BE-02-05 AC-2).
jobSchema.index({ customer: 1, status: 1 });

export const Job = mongoose.model('Job', jobSchema);
