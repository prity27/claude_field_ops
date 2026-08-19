# Project profile — FieldOps

> Written by `/project-setup`. Every `sdei-delivery` skill reads this file first.
> Detected values were read from the repository; asked values came from a human.
> When a detected value goes stale, re-run `/project-setup` rather than hand-editing.

Last updated: 2026-08-19 · Updated by: Claude (detection) — human rows pending

## Team

| Field | Value |
| --- | --- |
| Experience level | `mixed` *(asked, 2026-08-19)* |
| Verbosity contract | **write for `mid`, and put the `junior` explanation in a collapsed "Why" note** |
| Domain expertise | **unknown** — ask. Until answered, define every domain term before building on it |
| Domain | field-service job scheduling (dispatch, technicians, time slots, invoicing) *(asked)* |

**Verbosity contract** — how every later skill talks to this team:

- `junior` — explain the reasoning before the instruction, name the concept, link the reference.
- `mid` — state the instruction, add one line of why when the choice is not obvious.
- `senior` — instruction and `file:line` citation only.
- `mixed` — write for `mid`, and put the `junior` explanation in a collapsed "Why" note.

## Project stage

| Field | Value |
| --- | --- |
| Stage | `scaffolded` *(detected)* |
| Evidence for that stage | API boots and serves one route — `server/src/routes/health.js:11`; client renders it — `client/src/pages/HealthPage.jsx:5`; `server/src/models/` and `server/src/services/` are empty |
| Estimated completeness | ~0% of intended scope — infrastructure only, no domain logic exists |
| Activity | one commit, one author, 2026-08-19 |
| Repository layout | single repo, npm workspaces: `server/` + `client/` *(detected — `package.json:6`)* |

Greenfield project: the three brownfield lists do not apply.

## Backend

| Field | Value |
| --- | --- |
| Working directory | `/home/claudesdd02/projects/fieldops/server` *(detected)* |
| Git remote | `https://github.com/prity27/claude_field_ops.git` *(detected 2026-08-19)* |
| Default branch | `main`, tracking `origin/main` *(detected)* |
| Branch convention | **unknown** — ask |
| Stack family | Node *(detected — `package.json`)* |
| Language / runtime | JavaScript ESM on Node >= 20 *(detected — `"type": "module"`, `engines.node`)*; running Node 24.18.0 |
| Framework | Express 4.19 *(detected)* |
| Package manager | npm 11.16 with root `package-lock.json` committed *(detected)* |
| Build step | **none** — runs `node src/index.js` directly *(detected)* |
| Database | MongoDB via Mongoose 8.5 *(detected)* |
| Migrations | **none — schema lives only in the Mongoose models** *(detected: no `migrations/`, no migration tool in deps)* |
| Gate commands | `npm run lint --workspace=server` — **ran 2026-08-19, clean** |
| Test runner | **none configured.** `npm test` exits 1 by design — **ran 2026-08-19, fails as expected** |
| Entry point | `server/src/index.js` *(detected — `package.json` `main` and `start` agree)* |

## Frontend

| Field | Value |
| --- | --- |
| Working directory | `/home/claudesdd02/projects/fieldops/client` *(detected)* |
| Git remote | same repository as the backend — monorepo, `prity27/claude_field_ops` |
| Default branch | `main` |
| Stack family | React SPA *(detected)* |
| Language / framework | JavaScript + JSX + React 18.3 *(detected — deliberately not TypeScript, `CLAUDE.md`)* |
| Build tool | Vite 5.4 *(detected)* |
| Package manager | npm workspaces from the repository root |
| State management | **none** — React local state only *(detected)*. Adding one is a profile decision, per `CLAUDE.md` |
| UI system | **none** — unstyled semantic HTML *(detected)*. Open decision |
| Data fetching | `fetch` wrapper at `client/src/lib/api.js` *(detected)*; `CLAUDE.md` forbids bare `fetch` in components |
| Gate commands | `npm run lint --workspace=client && npm run build --workspace=client` — **ran 2026-08-19, clean; build emits `dist/` in 1.6s** |
| Test runner | **none configured.** `npm test` exits 1 by design |

Root shortcut, verified 2026-08-19: **`npm run gate` runs every gate above and exits 0.** Later
skills should use this single command.

## Deployment

| Field | Value |
| --- | --- |
| CI | **none** — no `.github/workflows/`, no other CI config *(detected)* |
| Delivery mechanism | **unknown** — ask |
| Environments | **unknown** — ask |
| Backend host | **unknown** — ask |
| Frontend host | **unknown** — ask |
| Install command on target | `npm ci` at the repository root *(follows from the committed lockfile)* |
| Restart / release command | **unknown** — depends on the delivery mechanism |
| Secrets live in | locally: `server/.env`, git-ignored *(detected — `.gitignore:3`)*. On a host: **unknown** |
| Rollback | **unknown** — ask |
| Health check | `GET /api/health` — returns 200 with `{status, db, uptimeSeconds}`, and **503 when Mongo is disconnected** *(detected — `server/src/routes/health.js:11`)*. Verified by reading; not yet exercised against a deployed instance |

## Security practices

| Field | Value |
| --- | --- |
| OWASP baseline | **always on** — `references/owasp-checklist.md` |
| Auth mechanism | **none yet.** No auth code exists. Per `CLAUDE.md`, auth ships in the baseline epic **before the first write endpoint** |
| Authorization model | **unknown** — a decision for `/write-stories`; roles are implied by the domain (dispatcher, technician, customer) but nothing has decided them |
| Secret management | `.env` git-ignored, `.env.example` committed with placeholders; all reads centralised in `server/src/config/env.js` and validated at boot *(detected)*. **Verified: no `.env` is tracked, and no credential appears in a tracked file** |
| Transport | **unknown** — no TLS termination exists locally; a deployment decision |
| Audit logging | **none.** `console.error` on 500 only *(detected — `server/src/middleware/errorHandler.js:24`)* |
| Known exceptions | `npm test` exits 1 (no runner yet); no auth (no write routes yet); no migrations (Mongoose models are the schema); JavaScript not TypeScript. All four are recorded in `CLAUDE.md` and **must not be reported as defects** |

## Compliance

Applicable regimes:

- [x] OWASP ASVS + Top 10 — always applies
- [ ] HIPAA / PHI — **unknown**, ask
- [ ] SOC 2 — **unknown**, ask
- [ ] GDPR — **likely**, ask: the domain stores customer names, addresses and contact details, which
      is personal data under GDPR whether or not the client operates in the EU

Notes: the schema will hold customer addresses and technician location or scheduling data. Both are
personal data and need a classification and a retention period decided in `/design-schema`, not
after launch.

## What a human must do

1. ~~Create the GitHub repository and add the remote.~~ **Done 2026-08-19** —
   `https://github.com/prity27/claude_field_ops.git`, `main` tracking `origin/main`.
2. Answer the rows still marked **unknown** above — team experience, branch convention, deployment,
   transport, and which compliance regimes apply.

Note: `gh` is not installed on this machine, so anything needing the GitHub API — creating a PR,
setting branch protection, adding Actions secrets — has to be done in the browser or after
`sudo apt install gh && gh auth login`. `/deploy` will need those secrets to exist before its
workflow runs green.

## Artefact locations

| Artefact | Path |
| --- | --- |
| This profile | `docs/delivery/PROFILE.md` |
| Knowledge graph | `docs/knowledge/graph.json` |
| Source digests | `docs/knowledge/sources/` |
| Open questions | `docs/knowledge/OPEN-QUESTIONS.md` |
| As-built inventory (brownfield only) | `docs/delivery/AS-BUILT.md` — not applicable |
| User stories | `docs/delivery/stories/` |
| Database model | `docs/delivery/SCHEMA.md` |
| API contract | `docs/API.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Validation matrix | `docs/delivery/VALIDATION.md` |
