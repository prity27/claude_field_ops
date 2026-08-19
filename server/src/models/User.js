import mongoose from 'mongoose';

export const ROLES = ['dispatcher', 'technician'];

/**
 * Identity and credential. A Technician record references one of these; a dispatcher has
 * only this. See docs/delivery/SCHEMA.md — the two were deliberately kept separate.
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // Excluded from every query by default. A per-endpoint filter is one forgotten
    // projection away from returning hashes; select:false is the version that survives.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ROLES, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    active: { type: Boolean, required: true, default: true, index: true },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
