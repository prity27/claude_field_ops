import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD, seedUser, uniqueEmail } from './support/harness.js';
import './support/hooks.js';

/**
 * BE-01-02 AC-2, the timing half — the three login failures must share "the same timing
 * characteristics", not only the same message.
 *
 * Why this is measured rather than asserted structurally: the defect it guards against is
 * returning early for a missing account, which makes the endpoint an enumeration oracle even
 * though both responses read identically. Asserting that `burnVerificationTime` was called would
 * prove the code called a function, not that the timings match.
 *
 * Why the margin is wide: bcrypt at cost 12 is ~200ms, and a shared CI box adds noise. The test
 * compares medians of several samples and allows a 3x spread, which still catches the real defect
 * — an early return is ~200ms against ~0ms, two orders apart — without flaking. A test that
 * flakes gets the suite switched off, which costs more than this criterion is worth.
 *
 * It calls the service rather than the route because the route's rate limiter (max 10) is
 * module-scoped and would refuse the samples.
 */

const SAMPLES = 5;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function timeFailure(fn) {
  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const started = process.hrtime.bigint();
    await assert.rejects(fn);
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  return median(samples);
}

describe('BE-01-02 AC-2 — the three failures share their timing characteristics', () => {
  it('BE-01-02 AC-2 — an unknown email takes comparable time to a wrong password, so latency does not enumerate accounts', async () => {
    const { login } = await import('../src/services/auth.service.js');
    const existing = await seedUser({ role: 'dispatcher' });

    const unknownEmail = await timeFailure(() => login(uniqueEmail('ghost'), 'some-password'));
    const wrongPassword = await timeFailure(() => login(existing.email, 'not-the-password'));

    // Both paths must actually do the key-derivation work. A no-op unknown-email path shows up
    // as a near-zero median.
    assert.ok(
      unknownEmail > 20,
      `an unknown email returned in ${unknownEmail.toFixed(1)}ms — too fast to have derived a key`,
    );

    const ratio = wrongPassword / unknownEmail;
    assert.ok(
      ratio > 1 / 3 && ratio < 3,
      `unknown email ${unknownEmail.toFixed(1)}ms vs wrong password ${wrongPassword.toFixed(1)}ms `
        + `(ratio ${ratio.toFixed(2)}) — the two are distinguishable by latency`,
    );
  });

  it('BE-01-02 AC-2 / BE-01-02 AC-4 — a deactivated account takes comparable time too', async () => {
    const { login } = await import('../src/services/auth.service.js');
    const deactivated = await seedUser({ role: 'technician', active: false });
    const existing = await seedUser({ role: 'dispatcher' });

    // Correct password, deactivated account: the hash is still compared before the rejection.
    const inactive = await timeFailure(() => login(deactivated.email, PASSWORD));
    const wrongPassword = await timeFailure(() => login(existing.email, 'not-the-password'));

    const ratio = wrongPassword / inactive;
    assert.ok(
      ratio > 1 / 3 && ratio < 3,
      `deactivated ${inactive.toFixed(1)}ms vs wrong password ${wrongPassword.toFixed(1)}ms `
        + `(ratio ${ratio.toFixed(2)}) — the two are distinguishable by latency`,
    );
  });
});
