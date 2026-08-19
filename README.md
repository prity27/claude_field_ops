# FieldOps

Field-service job scheduling. Customers raise jobs, a dispatcher assigns them to technicians in
time slots, technicians complete them in the field, and completed jobs become invoices.

**Status: scaffolded.** The API boots, connects to MongoDB and serves `/api/health`; the client
renders that health state. No domain features are implemented yet — they arrive through the
delivery chain in `docs/`.

## Stack

| | |
| --- | --- |
| API | Node 20+ · Express 4 · Mongoose 8 · ESM · no build step |
| Client | React 18 · Vite 5 · React Router 6 · JSX |
| Database | MongoDB 7 |
| Layout | npm workspaces — `server/`, `client/` |

## First run

```bash
git clone <remote> fieldops && cd fieldops
npm install                        # root only — workspaces install both
cp .env.example server/.env        # then edit MONGODB_URI if yours is not local
npm run dev                        # API on :4000, client on :5173
```

MongoDB must be reachable before `npm run dev`, or the API exits at boot with the connection error —
by design, rather than starting and failing on the first request.

Verify: `curl -s localhost:4000/api/health` returns `{"status":"ok","db":"connected",...}`, and
<http://localhost:5173> shows the same.

## Environment

Every variable the server reads, all validated in `server/src/config/env.js`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MONGODB_URI` | **yes** | — | connection string; absence fails at boot |
| `PORT` | no | `4000` | API listen port |
| `NODE_ENV` | no | `development` | `production` withholds 500 messages from clients |
| `CORS_ORIGIN` | no | `http://localhost:5173` | allowed browser origin |

The client reads `VITE_API_URL`, defaulting to `/api` — in development Vite proxies that to the API,
so no CORS preflight happens in the common path.

## Gates

```bash
npm run gate     # lint server, lint client, build client
npm test         # fails: no test runner is configured yet
```

`npm test` failing is the accurate state of the project, not a broken script.

## Delivery artefacts

Scope, schema and acceptance evidence live in the repository, produced by the `sdei-delivery`
plugin and diffable like code:

| Path | What |
| --- | --- |
| `docs/delivery/PROFILE.md` | stack, gates, hosts, security posture |
| `docs/knowledge/` | the sourced knowledge graph and open questions |
| `docs/delivery/stories/` | epics and acceptance criteria |
| `docs/delivery/SCHEMA.md` | the data model |
| `docs/delivery/VALIDATION.md` | criteria mapped to evidence |

See `CLAUDE.md` for the working rules and the conventions a change is reviewed against.
