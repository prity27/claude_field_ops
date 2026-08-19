import { after, before, beforeEach } from 'node:test';
import { resetDb, startDb, stopDb } from './harness.js';

/**
 * The per-file lifecycle. Importing this module is what wires a test file into the database.
 *
 * Each file is its own process (test/run.js explains why), so these run once per file: connect,
 * clear rows before every test, drop the file's database at the end.
 */
before(startDb);
after(stopDb);
beforeEach(resetDb);
