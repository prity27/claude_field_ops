# API contract

> Written from the routes as they exist on 2026-08-21, verified by exercising each one against a running server. Base path `/api`, port 4000.
> Customers (`BE-02`) were added on 2026-08-21 and are documented from the routes and from the 41
> tests in `server/test/customers.test.js` that exercise them — not from a running server.
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

### Customers

**Protected.** Every route below requires a session, and every state-changing request requires the
`x-csrf-token` header matching the `fo_csrf` cookie — `403 csrf_failed` otherwise.

Customers are **records, not accounts** — nothing here issues a credential
(`dec-no-customer-login`). There is **no delete endpoint**: `DELETE /api/customers/:id` is an
unknown route and answers `404 not_found`. Removal is archiving, below (`BE-02-05 AC-5`).

| Endpoint | Role | Body | Success | Failure |
| --- | --- | --- | --- | --- |
| `POST /api/customers` | dispatcher | `{name, siteAddress, contactPhone?, contactEmail?}` | `201 {customer}` | `400 invalid_body` · `403 forbidden` |
| `GET /api/customers` | any | — (query below) | `200 {customers, page}` | `400 invalid_body` |
| `GET /api/customers/:id` | any | — | `200 {customer}` | `404 customer_not_found` |
| `PATCH /api/customers/:id` | dispatcher | any of `{name, siteAddress, contactPhone, contactEmail}` | `200 {customer}` | `400 invalid_body` · `403 forbidden` · `404 customer_not_found` |
| `POST /api/customers/:id/archive` | dispatcher | — | `200 {customer}` | `403 forbidden` · `404 customer_not_found` · `409 customer_has_open_jobs` |

The `customer` object:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | ObjectId |
| `name` | string | ≤ 160 characters — **PII** (`SCHEMA.md:101`) |
| `siteAddress` | string | ≤ 500 characters — **PII** |
| `contactPhone` | string \| null | ≤ 40 characters — **PII** |
| `contactEmail` | string \| null | ≤ 254 characters, lower-cased — **PII** |
| `archived` | boolean | soft-delete state; `false` on create |
| `archivedAt` | ISO 8601 \| null | stamped when archiving succeeds |
| `createdAt` / `updatedAt` | ISO 8601 | server-set; not settable from a body |

Retention for the four PII fields is **unset** — `q-pii-retention` in
`docs/knowledge/OPEN-QUESTIONS.md` is still open, so no expiry is applied and none is implied.

**Fields outside the documented body are dropped**, as everywhere else — `archived`, `_id` and
`createdAt` in a create body are ignored (`BE-02-01 AC-4`). The one exception is `PATCH`, which
**rejects** `archived` and `archivedAt` with `400 invalid_body` rather than dropping them: they are
owned by the archive endpoint and its rules, and silently ignoring them would let a caller believe
they had archived a customer (`BE-02-04 AC-2`). A `PATCH` with no recognised field is also a
`400` rather than a no-op `200`.

**Concurrent updates resolve last-write-wins.** Only the fields present in a request are written,
so two updates to *different* fields both survive; two to the *same* field resolve to whichever
reached MongoDB second. There is no version or `If-Match` precondition (`BE-02-04 AC-4`).

`GET /api/customers` query parameters:

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer ≥ 1 | `1` | below 1 is **clamped** to 1 |
| `pageSize` | integer 1–100 | `25` | **maximum 100**; a larger value is clamped to 100, not rejected (`BE-02-03 AC-5`) |
| `includeArchived` | `true` \| `false` | `false` | archived customers are excluded unless this is `true` (`BE-02-03 AC-3`) |

A non-numeric `page` or `pageSize` is `400 invalid_body`. The response envelope:

```json
{
  "customers": [{ "id": "...", "name": "Northgate Dental", "archived": false }],
  "page": { "page": 1, "pageSize": 25, "total": 42, "totalPages": 2, "maxPageSize": 100 }
}
```

Order is `name` ascending with `_id` breaking ties, always — there is no `sort` parameter. The
tiebreak is correctness, not cosmetics: two customers sharing a name can otherwise swap places
between the query for page 1 and the query for page 2, and one of them is then never returned.

**Technician scoping.** A technician reads only the customers attached to a job assigned to them
(`BE-02-02 AC-3`, `BE-02-03 AC-4`). Any other id answers `404 customer_not_found` rather than
`403` — a `403` would confirm the id exists and turn the endpoint into an enumeration oracle for
the whole customer list. A technician's list is scoped the same way, and a technician with no
assignments gets an empty page rather than the full one.

**Archiving** is idempotent: archiving an already-archived customer is `200` with the state
unchanged, `archivedAt` included (`BE-02-05 AC-4`). It is refused with `409
customer_has_open_jobs` when the customer has any job outside `completed`, `invoiced` and
`cancelled`; the message names how many. An archived customer is out of the default list but still
resolves by id, so existing records keep referring to it (`BE-02-05 AC-3`).

Source: `server/src/routes/customers.js`, `server/src/services/customer.service.js`.

## Not in the contract yet

No job, assignment, technician or invoice endpoint exists. They arrive per approved epic through
`/build-module`, and this file is regenerated from the code each time rather than written ahead of
it — an API doc describing endpoints that do not exist is how a contract stops being trusted.
