---
epic: BE-03
title: Technician registry
unit: backend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [ent-technician, con-soft-delete, rel-technician-assignments]
depends_on: [BE-01]
---

A technician is both a schedulable resource and a person who logs in. This epic owns the resource;
BE-01 owns the credential.

---

### BE-03-01 — Create a technician

**Source:** `ent-technician` · interview §2.1 — "Two roles log in: dispatcher and technician."

**Acceptance criteria**

- **AC-1** Given a dispatcher and a name and email
  When they create a technician
  Then the record is created `active`, and a user account with the technician role is provisioned
  in the same operation

- **AC-2** Given an email already used by any user
  Then the request fails with 409 and **neither** the technician record nor the account is created

- **AC-3** Given a technician actor
  Then the response is 403

- **AC-4** Given a body with extra fields (`active`, `role`)
  Then they are ignored

**Estimate:** M
**Notes:** AC-2 is a multi-document write across the technician and user collections. Whether it is
transactional is a `/design-schema` question — flagged there rather than decided here. A partial
failure leaving an account with no technician record is the specific outcome to prevent.

### BE-03-02 — Read one technician

**Acceptance criteria**

- **AC-1** Given a dispatcher and an existing id
  Then the record is returned including `active`

- **AC-2** Given a missing id
  Then 404 with the standard envelope

- **AC-3** Given a technician
  Then they may read their own record and receive 404 for any other technician's id

**Estimate:** S

### BE-03-03 — List technicians

**Acceptance criteria**

- **AC-1** Given a dispatcher
  Then technicians are listed, paginated, with an enforced maximum page size and a deterministic sort

- **AC-2** Given deactivated technicians
  Then they are excluded by default and included only with an explicit flag

- **AC-3** Given a technician actor
  Then the response is 403 — a technician does not enumerate colleagues

**Estimate:** S

### BE-03-04 — Update a technician

**Acceptance criteria**

- **AC-1** Given a dispatcher and whitelisted fields
  Then only those change

- **AC-2** Given an attempt to set `active` here
  Then it is rejected — deactivation is BE-03-05

- **AC-3** Given a technician updating their own name
  Then it is permitted; updating another technician returns 404

**Estimate:** S

### BE-03-05 — Deactivate a technician

**Source:** `con-soft-delete` · interview §9.3 — "A technician is deactivated. On deactivation,
their future active assignments are marked superseded and surfaced to the dispatcher for
reassignment"

**Acceptance criteria**

- **AC-1** Given a dispatcher and an active technician
  When they deactivate them
  Then `active` becomes false, `deactivatedAt` is stamped, and the record is retained

- **AC-2** Given that technician has `active` assignments dated **today or later**
  When they are deactivated
  Then each such assignment becomes `superseded`
  And the affected jobs are returned in the response so the dispatcher can reassign them
  And each affected job returns to a state requiring scheduling

- **AC-3** Given assignments dated in the past
  Then they are left untouched — history is not rewritten

- **AC-4** Given a deactivated technician
  Then they cannot log in (BE-01-02 AC-4), do not appear in assignment pickers, and still resolve
  on existing records

- **AC-5** Given an already-deactivated technician
  When deactivated again
  Then 200 and no change *(idempotent)*

- **AC-6** Given any attempt to hard-delete a technician
  Then no such endpoint exists

<details><summary><strong>Why AC-2 returns the affected jobs rather than just succeeding</strong></summary>

Superseding assignments silently leaves jobs that look scheduled but have nobody attached. The
dispatcher finds out when the customer calls. Returning the list makes the consequence visible at
the moment the decision is made.
</details>

**Estimate:** L → **split candidate.** AC-2's cascade is arguably its own story. Flagged to the gate
rather than split unilaterally, because splitting it hides the cascade behind a second approval.
