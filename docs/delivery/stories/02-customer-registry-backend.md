---
epic: BE-02
title: Customer registry
unit: backend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [ent-customer, dec-no-customer-login, rel-customer-jobs, con-soft-delete]
depends_on: [BE-01]
---

Customers are **records, not accounts**. Nothing in this epic creates a credential.

**Out of scope:** customer login, self-service job raising, any customer-visible surface —
`ng-customer-portal`, `dec-no-customer-login` · interview §2.4 — "Customers do not log in."

---

### BE-02-01 — Create a customer

**Source:** `ent-customer` · interview §1.1 — "Customers have jobs that need doing at their site"

**Acceptance criteria**

- **AC-1** Given a dispatcher and a name and site address
  When they create a customer
  Then the record is created and returned in the standard envelope

- **AC-2** Given a missing name or site address
  Then the request fails with 400 naming the field

- **AC-3** Given a technician
  When they attempt to create a customer
  Then the response is 403 and the attempt is audited

- **AC-4** Given a body with extra fields (`archived`, `_id`, `createdAt`)
  Then they are ignored — only whitelisted fields are accepted

**Estimate:** M
**Notes:** `siteAddress`, `contactPhone` and `contactEmail` are PII. Classification and retention
are `q-pii-retention`, still open — this story is **blocked** on it for the retention AC only, not
for the rest.

### BE-02-02 — Read one customer

**Acceptance criteria**

- **AC-1** Given a dispatcher and an existing customer id
  Then the record is returned

- **AC-2** Given an id that does not exist
  Then the response is 404 with the standard envelope

- **AC-3** Given a technician
  Then they may read only customers attached to a job assigned to them, and any other id returns 404

- **AC-4** Given an archived customer
  Then a dispatcher can still read it, and the response marks it archived

**Estimate:** S
**Notes:** AC-3 extends `con-technician-scope` from jobs to the customers reachable through them.
Without it, technician scoping leaks the full customer list.

### BE-02-03 — List customers

**Acceptance criteria**

- **AC-1** Given a dispatcher
  Then the list is paginated with an enforced maximum page size, and the maximum is documented

- **AC-2** Given no explicit sort
  Then the order is deterministic, with ties broken by `_id`

- **AC-3** Given archived customers exist
  Then they are excluded by default and included only with an explicit flag

- **AC-4** Given a technician
  Then the list contains only customers reachable through their own assignments

- **AC-5** Given a page size above the maximum
  Then the maximum is applied rather than the request being honoured or rejected

**Estimate:** M

### BE-02-04 — Update a customer

**Acceptance criteria**

- **AC-1** Given a dispatcher and a partial update of whitelisted fields
  Then only those fields change

- **AC-2** Given an attempt to set `archived` through this endpoint
  Then it is rejected — archiving is BE-02-05, which has its own rules

- **AC-3** Given a technician
  Then the response is 403

- **AC-4** Given two concurrent updates
  Then the resolution is last-write-wins, stated explicitly in `docs/API.md` rather than left to
  chance

**Estimate:** S

### BE-02-05 — Archive a customer

**Source:** `con-soft-delete` · interview §9.3 — "A customer is archived. Archiving is blocked while
the customer has open jobs"

**Acceptance criteria**

- **AC-1** Given a dispatcher and a customer with no open jobs
  When they archive it
  Then `archived` becomes true, `archivedAt` is stamped, and the record is retained

- **AC-2** Given a customer with any job **not** in `completed`, `invoiced` or `cancelled`
  When archiving is attempted
  Then the request fails with 409, the customer is unchanged, and the message names how many open
  jobs block it

- **AC-3** Given an archived customer
  Then they do not appear in selection lists for new jobs, but still resolve on existing records

- **AC-4** Given an already-archived customer
  When archived again
  Then the response is 200 and the state is unchanged *(idempotent)*

- **AC-5** Given any attempt to hard-delete a customer
  Then no such endpoint exists

**Estimate:** M
