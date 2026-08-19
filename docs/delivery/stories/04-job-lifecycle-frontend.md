---
epic: FE-04
title: Job lifecycle — client
unit: frontend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [ent-job, proc-job-lifecycle, con-technician-scope]
depends_on: [BE-04, FE-01]
---

Two audiences, two views. The dispatcher needs breadth; the technician needs only today.

---

### FE-04-01 — Dispatcher job board

**Source:** `act-dispatcher` · interview §2.2 — "A dispatcher has full visibility of all jobs."

**Acceptance criteria**

- **AC-1** Given a dispatcher
  Then jobs are listed with customer, status, assigned technician and slot, filterable by status,
  customer, technician and date

- **AC-2** Given loading, empty and error
  Then each is a distinct visible state

- **AC-3** Given a filter or page change
  Then it is reflected in the URL, so a view can be shared and survives a reload

**Estimate:** M

### FE-04-02 — Technician queue

**Source:** `con-technician-scope` · interview §2.3

**Acceptance criteria**

- **AC-1** Given a technician
  Then they see only their own assigned jobs, grouped by date, today first

- **AC-2** Given a job in their queue
  Then the only actions offered are the ones their role and the job's state permit — start when
  `dispatched`, complete when `in_progress`

- **AC-3** Given the queue is empty for today
  Then that is stated plainly rather than rendered as a blank page

**Estimate:** M
**Notes:** AC-2 hides unavailable actions. The server still rejects them (BE-04-04 AC-5,
BE-04-06 AC-4) — hiding a control is not enforcement.

### FE-04-03 — Raise and view a job

**Acceptance criteria**

- **AC-1** Given a dispatcher
  Then they can raise a job against a customer, with validation mirroring the server

- **AC-2** Given the customer picker
  Then archived customers do not appear

- **AC-3** Given a job detail view
  Then it shows the full status history with actor and timestamp for each transition

- **AC-4** Given a submission in flight
  Then the control is disabled so a double-click cannot raise two jobs

**Estimate:** M
**Notes:** AC-3 needs a status history the backend does not currently store — BE-04 records the
actor and timestamp per transition on the job, not as a list. Flagged to the gate: either the
history becomes an entity, or AC-3 narrows to the latest transition.

### FE-04-04 — Complete, cancel and reopen

**Acceptance criteria**

- **AC-1** Given a technician completing a job
  Then notes are required in the form before submission is possible, matching BE-04-05 AC-2

- **AC-2** Given a dispatcher cancelling
  Then a reason is required, and the confirmation states that cancelling frees the technician's slot

- **AC-3** Given a dispatcher reopening an **invoiced** job
  Then the confirmation states plainly that the invoice will be voided, before they confirm

- **AC-4** Given any of these fails server-side
  Then the specific `error.code` is surfaced, not a generic failure

**Estimate:** M
**Status: partly BLOCKED — `q-completion-requirements`** affects AC-1's form, same as BE-04-05.
