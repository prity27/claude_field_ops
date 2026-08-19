---
epic: FE-03
title: Technician registry — client
unit: frontend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [ent-technician, con-soft-delete]
depends_on: [BE-03, FE-01]
---

### FE-03-01 — Technician list and form

**Source:** `ent-technician` · interview §2.1

**Acceptance criteria**

- **AC-1** Given a dispatcher
  Then technicians are listed with name, email and active state, paginated

- **AC-2** Given loading, empty and error
  Then each is a distinct visible state

- **AC-3** Given the create form
  Then validation mirrors the server, and a duplicate-email 409 is surfaced against the email field

- **AC-4** Given a technician actor
  Then this view is not reachable, matching BE-03-03 AC-3

**Estimate:** M

### FE-03-02 — Deactivate, with the consequence shown

**Source:** `con-soft-delete` · interview §9.3

**Acceptance criteria**

- **AC-1** Given a technician with future assignments
  When the dispatcher opens the deactivate confirmation
  Then it states **how many** future jobs will be unassigned, before they confirm

- **AC-2** Given the deactivation succeeds
  Then the affected jobs from the response are shown as a list the dispatcher can act on
  immediately

- **AC-3** Given a technician with no future assignments
  Then the confirmation says so plainly rather than showing an empty warning

**Estimate:** M
**Notes:** AC-1 needs the count before the action. Either a preview call or the confirmation is
built from an already-loaded assignment list — a `/build-module` decision, not a story decision.
