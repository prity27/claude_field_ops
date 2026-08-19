import { startDb, stopDb } from './harness.js';

/**
 * Runs once for the whole suite, not once per file. Starting a replica set costs a few seconds,
 * so the suite runs with `--test-isolation=none`: every test file shares this one process and
 * this one database, and each test clears its collections in `beforeEach`.
 */
export async function globalSetup() {
  await startDb();
}

export async function globalTeardown() {
  await stopDb();
}
