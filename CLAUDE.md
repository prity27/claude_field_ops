# FieldOps — working rules

Field-service job scheduling: customers raise jobs, a dispatcher assigns them to technicians in
time slots, technicians complete them in the field, and completed jobs become invoices.

This repository is also the reference project for the `sdei-delivery` plugin — the delivery
artefacts under `docs/` are as much the point as the code.

## Layout

```
server/   Express 4 + Mongoose 8 API, ESM, no build step   (@fieldops/server)
client/   React 18 + Vite 5 SPA, JSX, no TypeScript        (@fieldops/client)
docs/     delivery artefacts — profile, knowledge graph, stories, schema, validation
```

npm workspaces from the root. Run `npm install` once at the root, never inside a workspace.

## Commands

| Command | Does | Run from |
| --- | --- | --- |
| `npm run dev` | both servers — API on `:4000`, client on `:5173` | root |
| `npm run gate` | the full gate: lint both workspaces, run the server suite, build the client | root |
| `npm run lint --workspace=server` | server lint only | root |
| `npm test --workspace=server` | the server suite — `node:test`, one AC per test name | root |
| `npm test` | still **fails** — it also runs the client, which has no runner | root |

The server runner was stood up by `/write-tests` on 2026-08-19: Node's built-in `node:test` with
`supertest` and an ephemeral single-node replica set, entered through `server/test/run.js`. Every
test is named for the acceptance criterion it proves, so `/validate-delivery` can grep for an AC id
instead of forming an opinion. **The client still has no runner** — no approved frontend epic has
code yet — so root `npm test` still exits non-zero, and that half remains the honest state.

`npm run gate` now runs the server suite. As of 2026-08-19 the gate is **red**, with one failing
test: `BE-01-02 AC-3` requires a failed login to be logged with its source, and the audit entry
records no source. That is an unmet criterion, not a broken harness — do not fix it by weakening
the test.

There is no build step on the server. It runs `node src/index.js` directly — do not add a `dist/`
or a transpile step without changing `docs/delivery/PROFILE.md` in the same commit.

## Conventions

**Server**

- ESM everywhere. Relative imports carry the `.js` extension — Node requires it and omitting it
  fails at runtime, not at lint.
- Layering is `routes/ → services/ → models/`. A route handler does not touch a Mongoose model
  directly; it calls a service. This is what keeps authorization checks in one reviewable place.
- Errors: throw `AppError(status, code, message)` from `src/middleware/errorHandler.js`. Never
  `res.status(...)` an error from inside a service — services throw, the handler translates.
- Every response is JSON. Errors are always `{ error: { code, message } }`, never a bare string.
- Environment variables are read **only** in `src/config/env.js`. A `process.env` read anywhere else
  is a defect: it bypasses boot-time validation and fails in production instead of at startup.

**Client**

- Every network call goes through `src/lib/api.js`. No bare `fetch` in a component.
- Pages live in `src/pages/`, reusable pieces in `src/components/`. A page owns data fetching; a
  component receives props.
- No state library yet. When one is genuinely needed, that is a decision to record in the profile
  first, not a dependency to add quietly.

**Both**

- No secrets in the repository. `.env` is git-ignored; `.env.example` lists the variables with
  placeholder values and must stay in sync with what the code actually reads.

## Delivery process

Scope is not decided in a chat. It lives in `docs/`, and each artefact is produced by a plugin skill
that cites its source:

| Artefact | Written by | Is |
| --- | --- | --- |
| `docs/delivery/PROFILE.md` | `/project-setup` | the stack, gates, hosts and security posture |
| `docs/knowledge/graph.json` | `/ingest-knowledge` | sourced entities, actors, processes, constraints |
| `docs/delivery/stories/*.md` | `/write-stories` | epics with Given/When/Then criteria |
| `docs/delivery/SCHEMA.md` | `/design-schema` | the data model, with an ERD |
| `docs/delivery/VALIDATION.md` | `/validate-delivery` | every criterion mapped to evidence |

Rules that follow from that:

- **Do not build an epic whose story file is not `status: approved`.** The gate is the product.
- **Do not invent a requirement.** A gap becomes an entry in `docs/knowledge/OPEN-QUESTIONS.md`, not
  a reasonable default. An invented requirement is worse than a missing one, because the missing one
  gets noticed.
- Every claim in the delivery docs cites where it came from — a document and a quote, or a
  `file:line`.
- Run `/deep-review` before a PR merges. Run `/validate-delivery` before an epic is called done.

## Known state, deliberately

Do not report these as defects — they are recorded decisions, current as of the profile's date:

- No test runner **on the client**. See above; the server has one.
- No authentication yet. `POST`/`PATCH` routes do not exist yet either; auth arrives with the
  baseline epic, before the first write endpoint. A write route merged without an auth check is a
  blocking defect, not a follow-up.
- No migrations. Mongoose models are the only schema, so a field rename is a data-migration script
  someone writes by hand — say so when proposing one.
- JavaScript, not TypeScript. Deliberate, to keep the reference project's diffs about delivery
  process rather than type plumbing.
