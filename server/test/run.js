import { execFileSync, spawn } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

/**
 * The suite's entry point: start one database, run the tests in isolated processes, stop it.
 *
 * Two constraints forced this shape rather than a plain `node --test`:
 *
 * 1. `routes/auth.js:12` builds its rate limiter at module scope, so its 10-request budget is
 *    shared by every test in the same process. Running every file in one process — which is what
 *    a single shared connection would otherwise buy — means the eleventh login anywhere in the
 *    suite gets a 429 and tests begin to depend on each other's order. A process per file gives
 *    each one a fresh limiter, which is the honest way to test a module-scoped counter without
 *    editing the source to expose a reset.
 * 2. A replica set per file would then start one mongod per file. Starting one here and handing
 *    its URI to the children costs a single startup.
 *
 * `--test-global-setup` was tried first and rejected: with a replica set started inside it, the
 * runner completes every test and then hangs until it is killed.
 */

/**
 * The test environment, set here rather than in a committed `.env.test`, because `.gitignore`
 * ignores `.env.*` — a file the suite cannot run without must not be one a fresh clone lacks.
 *
 * These are not secrets. They are fixed, obviously-fake signing keys for a suite that talks to an
 * ephemeral database and no host. They override the shell, so a developer's own `NODE_ENV` or
 * `.env` cannot change what the tests assert.
 *
 * MONGODB_URI is a placeholder: `src/config/env.js` validates that the variable is *present* at
 * boot, and the harness connects to the replica set below instead of to its value. No test ever
 * touches a developer's own database.
 */
const TEST_ENV = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/fieldops-test-placeholder',
  OPERATING_TIMEZONE: 'Asia/Kolkata',
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'test-only-access-key-not-a-credential',
  JWT_REFRESH_SECRET: 'test-only-refresh-key-not-a-credential-either',
  // Stated explicitly rather than left to the defaults, because BE-01-02 AC-1 requires the token
  // lifetimes to be asserted against a documented number rather than against whatever the code
  // happens to do.
  ACCESS_TTL_SECONDS: '900',
  REFRESH_TTL_SECONDS: '2592000',
  PASSWORD_RESET_TTL_SECONDS: '3600',
};

function resolveMongod() {
  // Overridable, for a machine where mongod is not on the PATH.
  if (process.env.MONGOMS_SYSTEM_BINARY) return process.env.MONGOMS_SYSTEM_BINARY;
  try {
    return execFileSync('which', ['mongod'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'No mongod found. Install MongoDB, or set MONGOMS_SYSTEM_BINARY to its path. The suite uses '
        + 'the installed binary rather than downloading one.',
    );
  }
}

// A single-node replica set rather than a standalone mongod, per SCHEMA.md:298 — transactions are
// required from BE-03 onward and a standalone cannot run one.
const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  binary: { systemBinary: resolveMongod() },
});

const args = process.argv.slice(2);
const child = spawn(process.execPath, ['--test', ...(args.length ? args : ['test/**/*.test.js'])], {
  stdio: 'inherit',
  env: { ...process.env, ...TEST_ENV, MONGODB_TEST_URI: replSet.getUri() },
});

async function shutdown(code) {
  await replSet.stop();
  process.exit(code ?? 1);
}

child.on('exit', (code, signal) => shutdown(signal ? 1 : code));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
