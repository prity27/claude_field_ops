import mongoose from 'mongoose';

/**
 * Server-side refresh state. BE-01-03 AC-2 requires logout to invalidate a refresh token,
 * which a stateless token cannot satisfy.
 *
 * The token itself is never stored — only its hash — so a database leak does not hand over
 * live sessions.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Mongo removes expired documents on its own; nothing has to remember to sweep them.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
