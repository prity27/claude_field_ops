---
epic: FE-01
title: Identity and access — client
unit: frontend
status: draft
approved_by:
approved_on:
graph_entities: [act-dispatcher, act-technician, dec-two-roles]
depends_on: [BE-01]
---

The app shell, the single API client, and the auth flows. Everything later in the frontend depends
on these three, so they are one epic rather than scattered.

**Out of scope:** any customer-facing view — `ng-customer-portal`. Native mobile — `ng-mobile-app`;
technicians use this web client.

---

### FE-01-01 — App shell with protected and public routes

**As a** signed-in user
**I want** the app to know which pages need a session
**So that** an expired session does not render a broken page

**Source:** `dec-two-roles` · interview §2.1

**Acceptance criteria**

- **AC-1** Given an unauthenticated visitor
  When they open any protected route
  Then they are redirected to login, and the route they wanted is remembered and restored after
  a successful sign-in

- **AC-2** Given a signed-in technician
  When they open a dispatcher-only route
  Then they see a not-authorised view, not a blank page or a crash

- **AC-3** Given a signed-in user
  Then the shell shows who they are and their role, and offers logout

- **AC-4** Given a full page reload with a valid session
  Then the user stays signed in

**Estimate:** M
**Notes:** AC-2's role check is a UI convenience only. The server enforces it (BE-01-06) — a client
check that is the *only* check is a defect, not a feature.

### FE-01-02 — One API client

**As a** frontend developer
**I want** every network call to go through one module
**So that** auth headers, refresh and error mapping have one definition

**Source:** baseline template FE-02; `CLAUDE.md` conventions.

**Acceptance criteria**

- **AC-1** Given any feature code
  Then it calls `src/lib/api.js` and never `fetch` directly

- **AC-2** Given a 401 on any request
  Then the client attempts a token refresh once, retries the original request, and on a second
  failure signs the user out and redirects to login

- **AC-3** Given concurrent requests that all 401
  Then exactly **one** refresh is attempted and the others wait for it

- **AC-4** Given a non-2xx response
  Then the standard envelope's `error.code` is surfaced to the caller as a typed `ApiError`

<details><summary><strong>Why AC-3 matters more than it looks</strong></summary>

Without it, a page that fires five requests on load triggers five refreshes on an expired token.
With single-use refresh tokens (BE-01-03), four of them fail and the user is signed out mid-session
for no visible reason. It is a hard bug to reproduce and a trivial one to prevent.
</details>

**Estimate:** M
**Notes:** partly satisfied — `client/src/lib/api.js` exists with the envelope handling and
`ApiError`. Refresh, retry and single-flight do not exist yet.

### FE-01-03 — Auth flows and session expiry

**Source:** baseline template FE-03.

**Acceptance criteria**

- **AC-1** Given valid credentials
  When submitted
  Then the user is signed in and routed by role — dispatcher to the job board, technician to their
  queue

- **AC-2** Given invalid credentials
  Then one generic message is shown, matching BE-01-02 AC-2, and the password field is cleared

- **AC-3** Given a session that expires while the user is filling a form
  Then their input is not lost — they are prompted to re-authenticate and returned to the form

- **AC-4** Given logout
  Then tokens are cleared client-side and the refresh token is invalidated server-side

**Estimate:** M
**Notes:** AC-3 is the one users notice. Losing a half-written completion note because a token
expired is the difference between a tool people trust and one they work around.
