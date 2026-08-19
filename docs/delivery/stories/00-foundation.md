---
epic: INF-00
title: Foundation — infrastructure, configuration and data mechanics
unit: infra
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: []
depends_on: []
---

Generated from the baseline template, adapted to this stack: Node ESM, no build step, MongoDB via
Mongoose with **no migration tool**, npm workspaces, no CI.

Nothing was dropped. Two stories are already partly satisfied by the scaffold and say so in their
notes — INF-01 and INF-05 — but neither is complete, so both stay.

<details><summary><strong>Why this epic exists at all</strong></summary>

These stories feel like setup rather than scope, so they get skipped, and then they get retrofitted
during the first security review or the first deploy that goes wrong — at roughly ten times the
cost. Backups are the clearest case: nobody schedules them until the day they are needed.
</details>

---

### INF-00-01 — Runnable from a clean clone

**As a** new engineer
**I want** to clone the repository and have the app running by following the README
**So that** onboarding does not depend on someone's memory

**Source:** baseline template INF-01. No graph source — this is infrastructure, not scope.

**Acceptance criteria**

- **AC-1** Given a clean clone and a reachable MongoDB
  When an engineer follows the README's first-run section exactly
  Then the API answers `GET /api/health` with 200 and the client renders it
  And no undocumented command was needed

- **AC-2** Given a required environment variable is absent
  When the API starts
  Then it exits non-zero at boot with a message naming the missing variable
  And it does **not** start and fail at the first request

- **AC-3** Given the README's environment table
  When compared against every variable the code reads
  Then the two sets match exactly, with a description and an example value for each

**Estimate:** S
**Notes:** partly satisfied — `server/src/config/env.js:11` already does AC-2. AC-1 and AC-3 need
verifying against the README after each epic that adds a variable.

### INF-00-02 — Environment separation

**As an** operator
**I want** local, staging and production configuration to differ without a code change
**So that** promoting a build is not a rebuild

**Source:** baseline template INF-02.

**Acceptance criteria**

- **AC-1** Given the source tree
  When searched for environment-specific values (hosts, URLs, connection strings, keys)
  Then none is found outside `server/src/config/env.js` and `.env` files

- **AC-2** Given `NODE_ENV=production`
  When the API boots
  Then production configuration is loaded and validated at boot, and a missing production-only
  variable fails the boot

- **AC-3** Given any environment
  When a variable is read anywhere other than `config/env.js`
  Then that is a review failure — the rule is documented in `CLAUDE.md`

**Estimate:** S

### INF-00-03 — Secrets are not in the repository

**As a** security reviewer
**I want** certainty that no credential is tracked
**So that** a repository leak is not a credential leak

**Source:** baseline template INF-03. OWASP A05.

**Acceptance criteria**

- **AC-1** Given the repository
  When `git ls-files` is inspected
  Then no `.env`, key, certificate or credential file appears

- **AC-2** Given `.gitignore`
  Then it covers `.env` and `.env.*` while permitting `.env.example`

- **AC-3** Given every secret the system needs
  Then each has a documented home in `PROFILE.md` — and where a credential has **ever** been
  committed, it is rotated, not merely deleted

<details><summary><strong>Why rotation, not deletion</strong></summary>

Deleting a committed secret removes it from the working tree, not from git history. Anyone with a
clone — or the GitHub API — still has it. The only remediation is rotation.
</details>

**Estimate:** S
**Notes:** currently satisfied; verified 2026-08-19 that no `.env` is tracked. This story is the
standing check, re-run at each validation.

### INF-00-04 — Gates run in CI

**As a** reviewer
**I want** typecheck, lint and tests to run on every pull request
**So that** a broken change cannot merge on the strength of someone's local run

**Source:** baseline template INF-04.

**Acceptance criteria**

- **AC-1** Given a pull request against `main`
  When it opens or updates
  Then CI runs the same commands a developer runs locally — `npm run gate`, then `npm test`

- **AC-2** Given a failing gate
  Then the merge is blocked, not warned about

- **AC-3** Given `npm test` currently exits 1 by design
  Then CI treats that as a failure once INF-00-04 and a test runner both exist — until then the
  test step is explicitly marked `continue-on-error` **with a comment saying why and when it comes
  off**

**Estimate:** M
**Notes:** no CI exists (`PROFILE.md`). `gh` is not installed, so branch protection must be set in
the browser. Blocked on nothing; delivered by `/deploy`.

### INF-00-05 — Health check

**As a** deploy pipeline
**I want** an unauthenticated endpoint reporting liveness and dependency readiness
**So that** a deploy can be failed automatically rather than by someone watching

**Source:** baseline template INF-05.

**Acceptance criteria**

- **AC-1** Given a running API with MongoDB reachable
  When `GET /api/health` is called without credentials
  Then the response is 200 with `status`, `db` and `uptimeSeconds`

- **AC-2** Given MongoDB is unreachable
  When `GET /api/health` is called
  Then the response is **503**, not 200 with a degraded body

- **AC-3** Given a deploy
  Then the pipeline calls the endpoint and a non-200 fails the job

**Estimate:** S
**Notes:** AC-1 and AC-2 satisfied at `server/src/routes/health.js:11`. AC-3 needs `/deploy`.

### INF-00-06 — Logging that works in production

**As an** operator
**I want** structured logs with request correlation in every environment
**So that** a production incident is diagnosable

**Source:** baseline template INF-06. OWASP A09.

**Acceptance criteria**

- **AC-1** Given any environment including production
  When a request is handled
  Then a structured log line is emitted with method, path, status, duration and a request id

- **AC-2** Given a request that fails
  Then the log carries the same request id returned to the client, so the two can be joined

- **AC-3** Given any log output
  Then it contains no password, token, or customer contact detail

- **AC-4** Given the logger
  Then it is active in production and **not** gated behind a development-only flag

<details><summary><strong>Why AC-4 is called out separately</strong></summary>

A logger disabled in production is the single most common form of this defect, and it is invisible
until the first incident — at which point there is nothing to read.
</details>

**Estimate:** M

### INF-00-07 — Error handling and the response envelope

**As a** client developer
**I want** one error shape across every endpoint
**So that** error handling is written once

**Source:** baseline template INF-07.

**Acceptance criteria**

- **AC-1** Given any non-2xx response from any endpoint
  Then the body is `{ error: { code, message } }` with a snake_case `code`

- **AC-2** Given an unhandled exception in production
  Then the response carries a generic message and a correlation id, and never a stack trace

- **AC-3** Given `docs/API.md`
  Then the envelope is documented there and matches the code

**Estimate:** S
**Notes:** partly satisfied at `server/src/middleware/errorHandler.js:26`. AC-2's correlation id
does not exist yet and depends on INF-00-06.

---

## Migrations and data

### INF-00-08 — Decide the schema-change mechanism, explicitly

**As a** team
**I want** a decided, documented way to change the database schema
**So that** the first field rename is not improvised against production

**Source:** baseline template MIG-01. `PROFILE.md` records **no migrations — the Mongoose models
are the only schema**.

**Acceptance criteria**

- **AC-1** Given the profile's "no migrations" state
  When this story is taken up
  Then a human decides between adopting a migration tool and keeping models-as-schema, and the
  decision with its reasoning is written into `PROFILE.md` and `docs/ARCHITECTURE.md`

- **AC-2** Given the decision is "no migration tool"
  Then the documented procedure for a breaking field change exists, names who runs it, and states
  that nothing in the repository will remind anyone to run it

- **AC-3** Given the decision is "adopt a tool"
  Then every existing model has a baseline migration and the tool runs in CI

**Estimate:** M
**Notes:** this is a **decision story** — it is not built, it is decided. It must be settled before
`/design-schema` emits model code, because retrofitting migrations onto a live collection is far
more expensive than starting with them.

### INF-00-09 — Rollback for the last schema change

**Source:** baseline template MIG-02.

**Acceptance criteria**

- **AC-1** Given the most recent schema change
  Then the previous shape can be restored by a documented procedure

- **AC-2** Given that procedure
  Then it has been executed at least once against a copy of real-shaped data, and the date recorded

- **AC-3** Given a change with no reversal
  Then that is stated **before** the change ships, because it makes the release one-way

**Estimate:** S
**Notes:** depends on INF-00-08.

### INF-00-10 — Seed data

**As a** developer
**I want** a repeatable seed producing a usable local dataset
**So that** the app can be exercised without hand-entering records

**Source:** baseline template MIG-03.

**Acceptance criteria**

- **AC-1** Given an empty local database
  When the seed is run
  Then it creates both roles, at least one dispatcher, three technicians, five customers and jobs
  in every lifecycle state

- **AC-2** Given the seed has already run
  When it runs again
  Then it succeeds and does not duplicate records

- **AC-3** Given `NODE_ENV=production`
  When the seed is invoked
  Then it refuses to run

**Estimate:** M
**Notes:** depends on BE-01 (roles) and BE-04 (job states).

### INF-00-11 — Backups and restore

**Source:** baseline template MIG-04.

**Acceptance criteria**

- **AC-1** Given production
  Then a backup schedule and a retention period are documented in `PROFILE.md`

- **AC-2** Given a backup
  Then a restore has **actually been performed once** into a scratch environment, and the date and
  outcome recorded

- **AC-3** Given the restore procedure
  Then it states the expected data loss window

<details><summary><strong>Why AC-2 is non-negotiable</strong></summary>

An untested backup is not a backup — it is a belief. The failure mode is discovering the backups
were empty, or unrestorable, on the day they are needed.
</details>

**Estimate:** M

### INF-00-12 — Indexes match the queries

**Source:** baseline template MIG-05.

**Acceptance criteria**

- **AC-1** Given every filter and sort field used by an approved story
  Then each is covered by an index recorded in `docs/delivery/SCHEMA.md`

- **AC-2** Given the assignment uniqueness rule
  Then a **unique partial index** on `(technician, date, slot)` scoped to `status: "active"` exists

- **AC-3** Given any list endpoint
  Then its default sort is deterministic, with ties broken by `_id`

<details><summary><strong>Why the index in AC-2 must be partial</strong></summary>

Reassignment supersedes rather than overwrites (`q-reassignment`), so superseded rows keep their
`(technician, date, slot)` values. A plain unique index would count those, and the slot would become
permanently unusable after any reassignment.
</details>

**Estimate:** S
**Notes:** depends on `/design-schema`. AC-3 prevents the pagination bug where equal sort keys
reshuffle between pages and records are silently skipped.
