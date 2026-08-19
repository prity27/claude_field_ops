---
epic: BE-01
title: Identity and access
unit: backend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [act-dispatcher, act-technician, dec-two-roles, con-technician-scope]
depends_on: [INF-00]
---

Two roles, no customer login. Every authorization rule in the product resolves to something in this
epic, so it lands before the first write endpoint — per `CLAUDE.md`, a write route merged without an
auth check is a blocking defect, not a follow-up.

**Out of scope for the whole epic:** customer accounts and self-service — `ng-customer-portal`,
`dec-no-customer-login`. Any story proposing a customer login is inventing scope.

---

### BE-01-01 — Provision a user

**As a** dispatcher
**I want** to create accounts for dispatchers and technicians
**So that** staff can sign in

**Source:** `dec-two-roles` · interview §2.1 — "Two roles log in: dispatcher and technician."

**Acceptance criteria**

- **AC-1** Given a dispatcher and a valid name, email and role
  When they provision an account
  Then the user is created with that role and a password hashed with a modern KDF (argon2id or
  bcrypt cost ≥ 12)
  And the response contains no password field of any kind

- **AC-2** Given an email already in use
  When provisioning is attempted
  Then the request fails with 409 and the standard envelope
  And the message does not reveal which existing account holds it beyond the fact of the conflict

- **AC-3** Given a role outside `{dispatcher, technician}`
  When provisioning is attempted
  Then the request fails with 400 naming the invalid field

- **AC-4** Given a technician
  When they attempt to provision any account
  Then the response is 403 and the attempt is audited

- **AC-5** Given a request body containing extra fields (`isAdmin`, `_id`, `passwordHash`)
  Then those fields are ignored — only whitelisted fields are read

<details><summary><strong>Why AC-5 is on every write story in this project</strong></summary>

Mass assignment (OWASP A03) is the defect where a request body is passed to a model constructor
whole. It is invisible in review unless someone specifically looks for it, and it escalates
privilege in one line.
</details>

**Estimate:** M

### BE-01-02 — Log in

**As a** dispatcher or technician
**I want** to exchange my credentials for a session
**So that** I can use the system

**Source:** `act-dispatcher`, `act-technician` · interview §2.1

**Acceptance criteria**

- **AC-1** Given valid credentials for an active user
  When they log in
  Then an access token and a refresh token are returned with documented lifetimes
  And the response includes the user's role

- **AC-2** Given an unknown email, a wrong password, or a deactivated account
  When they log in
  Then all three return the **same** generic failure with the same status and timing characteristics

- **AC-3** Given repeated failed attempts from one source
  Then attempts are rate-limited and each failure is logged with the source and the timestamp

- **AC-4** Given a deactivated technician (`ent-technician.active = false`)
  When they log in with correct credentials
  Then login fails per AC-2

<details><summary><strong>Why AC-2 groups three different failures</strong></summary>

Distinguishing "no such account" from "wrong password" turns the login endpoint into an account
enumeration oracle. Timing matters as much as the message — comparing a hash for a real user and
returning early for a missing one is measurably different.
</details>

**Estimate:** M

### BE-01-03 — Refresh and log out

**Source:** baseline template AUTH-03.

**Acceptance criteria**

- **AC-1** Given a valid refresh token
  When it is presented
  Then a new access token is issued

- **AC-2** Given a logout
  Then the refresh token is invalidated server-side and cannot be reused

- **AC-3** Given a refresh token invalidated by logout or a password change
  When it is presented
  Then the response is 401 and no new access token is issued

- **AC-4** Given an expired or malformed refresh token
  Then the response is 401 with the standard envelope

**Estimate:** M
**Notes:** AC-2 requires server-side refresh token state. A stateless refresh token cannot satisfy
it — that is the design constraint this story imposes.

### BE-01-04 — Password reset

**Source:** baseline template AUTH-04.

**Acceptance criteria**

- **AC-1** Given a reset request for any address
  Then the response is identical whether or not an account exists

- **AC-2** Given a reset token
  Then it is single-use, time-limited, and delivered out of band

- **AC-3** Given a completed reset
  Then all existing sessions and refresh tokens for that user are invalidated

- **AC-4** Given an already-used or expired token
  Then the reset fails with 400 and no password is changed

**Estimate:** M
**Notes:** out-of-band delivery needs a mail transport, which the profile does not record. Flagged
to the gate as a dependency, not assumed.

### BE-01-05 — Every route requires authentication unless it opts out

**Source:** baseline template AUTH-05. OWASP A01.

**Acceptance criteria**

- **AC-1** Given any route
  Then authentication is required by default; being public is an explicit, reviewed opt-out

- **AC-2** Given the opt-out list
  Then it contains only `GET /api/health` and the auth endpoints, and is documented in `docs/API.md`

- **AC-3** Given a new route added with no auth declaration
  Then it is protected — the default is safe, not open

**Estimate:** M
**Notes:** the safe default in AC-3 is the whole point. A default-open router means every future
forgotten route is a vulnerability.

### BE-01-06 — One authorization model

**Source:** `dec-two-roles` · interview §2.1. OWASP A01.

**Acceptance criteria**

- **AC-1** Given the two roles
  Then they are defined once, in one place, and enforced by one mechanism

- **AC-2** Given any route requiring a role
  Then the requirement is declared **at the route**, readable without opening the handler

- **AC-3** Given a route with no declaration
  Then review fails — there is no implicit permission

- **AC-4** Given a request from a role without the required permission
  Then the response is 403, the standard envelope, and an audit entry

**Estimate:** M

### BE-01-07 — Object-level authorization

**As a** technician
**I want** to be unable to see or act on another technician's jobs
**So that** the scoping rule is real rather than a UI convention

**Source:** `con-technician-scope` · interview §2.3 — "A technician sees only the jobs assigned to
them. They cannot see another technician's jobs."

**Acceptance criteria**

- **AC-1** Given a technician and a job assigned to a **different** technician
  When they fetch it by id
  Then the response is 404 — not 403, and not the record

- **AC-2** Given a technician and a job assigned to a different technician
  When they attempt any state transition on it
  Then the response is 404 and no state changes

- **AC-3** Given a dispatcher
  Then no such scoping applies — every job is visible

- **AC-4** Given any endpoint accepting a record id
  Then a test exists proving a second user's id is rejected

<details><summary><strong>Why 404 and not 403 in AC-1</strong></summary>

403 confirms the record exists. For a resource a technician may not know about at all, that is an
information leak — they can enumerate ids and learn how many jobs exist. 403 is right when the
caller is entitled to know the thing exists but not to act on it; 404 is right here.
</details>

**Estimate:** M
**Notes:** this is the project's primary IDOR surface. AC-4 makes the test mandatory rather than
aspirational.

### BE-01-08 — Audit trail for sensitive actions

**Source:** baseline template AUTH-08. OWASP A09.

**Acceptance criteria**

- **AC-1** Given a login success or failure, an authorization failure, a role change, an account
  deactivation, a job cancellation, a job reopen, or an invoice void
  Then an audit entry records actor, target, action and timestamp

- **AC-2** Given an audit entry
  Then it cannot be altered or deleted through any API surface

- **AC-3** Given any audit entry
  Then it contains no password, token or full customer contact detail

**Estimate:** M
**Notes:** the action list in AC-1 is drawn from the exceptional transitions this domain has —
cancel (§9.2), reopen (§8.3) and void (§8.3). It grows as epics land.

### BE-01-09 — CSRF protection on state-changing routes

> **Added after this epic was approved.** It is a direct consequence of the token-storage
> decision taken at the `/build-module` gate on 2026-08-19 — cookies are sent automatically by
> the browser, so httpOnly storage trades an XSS risk for a CSRF one. It is built and working,
> and it **needs sign-off** rather than being treated as approved scope.

**As a** signed-in user
**I want** another site to be unable to act on my behalf
**So that** my session cookie is not a blank cheque

**Source:** no graph source — a consequence of the httpOnly-cookie decision, build gate 2026-08-19.

**Acceptance criteria**

- **AC-1** Given any state-changing request (POST, PATCH, DELETE) with valid session cookies
  When the `x-csrf-token` header is absent or does not match the `fo_csrf` cookie
  Then the response is 403 `csrf_failed` and nothing is written

- **AC-2** Given the header matches the cookie
  Then the request proceeds

- **AC-3** Given a safe method (GET, HEAD, OPTIONS)
  Then no CSRF check applies

- **AC-4** Given the CSRF cookie
  Then it is **not** httpOnly — the client must read it to echo it — and it is not a credential
  on its own

**Estimate:** S
**Notes:** `SameSite=Strict` already blocks most cross-site cookie sending; this is defence in
depth. **Known gap:** `/auth/logout` and `/auth/refresh` sit ahead of the CSRF middleware because
they precede `authenticate`, so a forged cross-site request can log a user out. Annoying rather
than damaging, and it is a real gap — recorded, not hidden.
