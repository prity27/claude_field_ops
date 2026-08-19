import bcrypt from 'bcryptjs';

// BE-01-01 AC-1 requires a modern KDF at bcrypt cost >= 12. Chosen over argon2 because it
// needs no native build (build gate, 2026-08-19). ~200ms per hash is deliberate.
const COST = 12;

export function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, COST);
}

export function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Burns roughly the same time as a real verification, against a hash that cannot match.
 *
 * Without this, a login for an unknown email returns measurably faster than one for a known
 * email with a wrong password, and the endpoint becomes an account-enumeration oracle even
 * though both responses read identically (BE-01-02 AC-2).
 */
const DUMMY_HASH = bcrypt.hashSync('fieldops-timing-equaliser', COST);

export function burnVerificationTime() {
  return bcrypt.compare('fieldops-timing-equaliser', DUMMY_HASH);
}
