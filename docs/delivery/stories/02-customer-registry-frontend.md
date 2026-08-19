---
epic: FE-02
title: Customer registry — client
unit: frontend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [ent-customer, con-soft-delete]
depends_on: [BE-02, FE-01]
---

### FE-02-01 — Customer list

**Source:** `ent-customer` · interview §1.1

**Acceptance criteria**

- **AC-1** Given a dispatcher
  Then customers are listed with name and site address, paginated, matching the server's maximum
  page size

- **AC-2** Given the list is loading, empty, or failed
  Then each is a distinct visible state — never a blank region

- **AC-3** Given archived customers
  Then they are hidden until an explicit toggle, and shown as archived when included

**Estimate:** S

### FE-02-02 — Create and edit a customer

**Acceptance criteria**

- **AC-1** Given the form
  Then required fields are marked, and client validation mirrors the server's rules

- **AC-2** Given a server-side validation error
  Then it is surfaced against the specific field, not as a banner

- **AC-3** Given a submission in flight
  Then the submit control is disabled so a double-click cannot create two customers

**Estimate:** M
**Notes:** AC-3 is the cheapest duplicate-record prevention there is, and it is skipped constantly.

### FE-02-03 — Archive a customer

**Acceptance criteria**

- **AC-1** Given a customer with no open jobs
  When the dispatcher archives them
  Then they confirm first, and the list reflects the change without a full reload

- **AC-2** Given the server returns 409 because open jobs exist
  Then the message says how many open jobs block it, taken from the server response rather than
  guessed at

**Estimate:** S
