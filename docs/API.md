# API contract

> Written from the routes as they exist on 2026-08-19. Base path `/api`, port 4000.
> Every endpoint here was read from code; none has been exercised against a deployed instance.
> Regenerate with `/write-docs` after any epic that adds or changes a route.

## Conventions

| | |
| --- | --- |
| Content type | `application/json` on every request and response |
| Auth | **none yet** — no endpoint requires a credential, because no write endpoint exists |
| Error shape | `{ "error": { "code": "<snake_case>", "message": "<human readable>" } }` — always, for every non-2xx |
| Unknown route | `404` `{ error: { code: "not_found", message: "No route for <METHOD> <path>" } }` |
| Unhandled failure | `500` `{ error: { code: "internal_error", ... } }`; the message is `Internal server error` when `NODE_ENV=production` |
| Body limit | 1 MB; a larger body is rejected by the JSON parser |

Clients should switch on `error.code`, never on `error.message` — the message is for humans and may
change without notice; the code is the contract.

## Endpoints

### `GET /api/health`

Liveness **and** dependency readiness. Safe to call unauthenticated; used as the deploy gate.

`200 OK` — the API is up and MongoDB is connected:

```json
{ "status": "ok", "db": "connected", "uptimeSeconds": 142 }
```

`503 Service Unavailable` — the process is up but MongoDB is not reachable:

```json
{ "status": "degraded", "db": "disconnected", "uptimeSeconds": 3 }
```

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `"ok" \| "degraded"` | mirrors the HTTP status |
| `db` | `"connected" \| "disconnected"` | Mongoose `readyState === 1` |
| `uptimeSeconds` | integer | process uptime, whole seconds |

Source: `server/src/routes/health.js:11`.

A non-200 here means **roll back** — it is the check `/deploy` runs after a release, and it fails
the job rather than warning.

## Not in the contract yet

No customer, job, assignment, technician or invoice endpoint exists. They arrive per approved epic
through `/build-module`, and this file is regenerated from the code each time rather than written
ahead of it — an API doc describing endpoints that do not exist is how a contract stops being
trusted.
