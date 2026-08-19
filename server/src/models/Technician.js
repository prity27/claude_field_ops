import mongoose from 'mongoose';

/**
 * A schedulable resource. Distinct from User so that Assignment references a resource
 * rather than a login, and so a dispatcher needs no row here.
 *
 * name and email are duplicated from User by design (SCHEMA.md gate, 2026-08-19). They are
 * written together in one transaction — this record is the display source for scheduling
 * views, User is the identity source for login.
 */
const technicianSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    active: { type: Boolean, required: true, default: true },
    deactivatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Serves the assignment picker: active technicians, sorted by name.
technicianSchema.index({ active: 1, name: 1 });

export const Technician = mongoose.model('Technician', technicianSchema);
