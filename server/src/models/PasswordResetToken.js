import mongoose from 'mongoose';

/**
 * Added after SCHEMA.md was validated, because BE-01-04 cannot be built without it.
 * Recorded as an addition in SCHEMA.md rather than slipped in — see its "Added during BE-01"
 * note. Same shape discipline as RefreshToken: the token itself is never stored.
 */
const passwordResetTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
