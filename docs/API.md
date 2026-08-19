# API contract

> Written from the routes as they exist on 2026-08-19, verified by exercising each one against a running server. Base path `/api`, port 4000.
> Every endpoint here was read from code; none has been exercised against a deployed instance.
> Regenerate with `/write-docs` after any epic that adds or changes a route.

## Conventions

| | |
| --- | --- |
| Content type | `application/json` on every request and response |
| Auth | Session cookies. Every route requires one **except** `GET /api/health` and the five `/api/auth/*` endpoints |
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

### Authentication

All five are **public** — they and `GET /api/health` are the entire opt-out list (`BE-01-05 AC-2`).

Tokens are delivered as cookies, never in the response body:

| Cookie | httpOnly | Purpose |
| --- | --- | --- |
| `fo_access` | yes | short-lived access token (default 15 min) |
| `fo_refresh` | yes | long-lived refresh token (default 30 days) |
| `fo_csrf` | **no** | echoed back in `x-csrf-token`; readable by design, not a credential alone |

All are `SameSite=Strict`, and `Secure` when `NODE_ENV=production`.

| Endpoint | Body | Success | Failure |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `{email, password}` | `200 {user}` + cookies | `401 invalid_credentials` — **identical for unknown email, wrong password and deactivated account** |
| `POST /api/auth/refresh` | — (refresh cookie) | `200 {refreshed:true}` + new access cookie | `401 invalid_refresh_token` |
| `POST /api/auth/logout` | — | `200 {loggedOut:true}`, cookies cleared | — (logging out without a session is not an error) |
| `POST /api/auth/password-reset/request` | `{email}` | `202 {requested:true}` — **identical whether or not the account exists** | `400 invalid_body` |
| `POST /api/auth/password-reset/complete` | `{token, password}` | `200 {reset:true}`, all sessions revoked | `400 invalid_reset_token` |

### Users

**Protected.** Every route below requires a session, and every state-changing request requires the
`x-csrf-token` header matching the `fo_csrf` cookie — `403 csrf_failed` otherwise.

| Endpoint | Role | Body | Success | Failure |
| --- | --- | --- | --- | --- |
| `POST /api/users` | dispatcher | `{email, name, password, role}` | `201 {user}` | `409 email_in_use` · `400 invalid_body` · `403 forbidden` |
| `GET /api/users/me` | any | — | `200 {actor}` | `401 unauthenticated` |

Fields outside the documented body are **dropped**, not rejected — `_id`, `active`, `passwordHash`
and anything else in a request body never reach the model.

## Not in the contract yet

No customer, job, assignment, technician or invoice endpoint exists. They arrive per approved epic
through `/build-module`, and this file is regenerated from the code each time rather than written
ahead of it — an API doc describing endpoints that do not exist is how a contract stops being
trusted.
