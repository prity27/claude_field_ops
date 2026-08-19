---
epic: BE-05
title: Scheduling
unit: backend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [ent-assignment, proc-assign-technician, con-no-double-booking, rel-job-assignment, rel-technician-assignments]
depends_on: [BE-04]
---

The core invariant of the product lives here: **a technician cannot be double-booked**, absolutely,
with no override (`con-no-double-booking` · interview §9.1).

A slot is a fixed grid — `(technician, date, slot)` with slot in `{morning, afternoon, evening}`
(§8.1). That decision is what allows the database to enforce the invariant via a **unique partial
index on active assignments**, rather than application code racing itself.

---

### BE-05-01 — Assign a technician to a job

**Source:** `proc-assign-technician` · interview §4.2 — "An assignment that overlaps an existing
assignment for that technician must be rejected, not warned about."

**Acceptance criteria**

- **AC-1** Given a dispatcher, a `raised` job, an active technician, a date and a slot
  When they assign
  Then an `active` assignment is created and the job becomes `scheduled`

- **AC-2** Given that technician already has an `active` assignment for that date and slot
  When assignment is attempted
  Then the request fails with **409**, no assignment is created, and the job is unchanged

- **AC-3** Given two dispatchers assigning the same technician to the same slot **concurrently**
  Then exactly one succeeds and the other receives 409
  And the failure comes from the unique index, not from a read-then-write check

- **AC-4** Given a deactivated technician
  Then 409 and no assignment is created

- **AC-5** Given a technician actor
  Then 403 and the attempt is audited

- **AC-6** Given a job not in `raised`
  Then 409 — rescheduling an already-scheduled job is BE-05-02

<details><summary><strong>Why AC-3 names the mechanism, not just the outcome</strong></summary>

A read-then-write check ("is this slot free? then insert") passes every single-threaded test and
fails under real concurrency, because both requests read "free" before either writes. Naming the
unique index as the enforcement makes the test meaningful: the criterion is not "it usually works"
but "the database refused the second write".
</details>

**Estimate:** M
**Notes:** AC-1 is a multi-document write — create the assignment, advance the job. Atomicity is a
`/design-schema` question. A created assignment with the job left `raised` is the outcome to prevent.

### BE-05-02 — Reassign a job to a different technician

**Source:** `rel-job-assignment` · interview §8.2 — "the previous assignment is not overwritten: it
is marked superseded and a new active assignment is created."

**Acceptance criteria**

- **AC-1** Given a dispatcher and a job with an `active` assignment, in any state before `completed`
  When they reassign it to another technician, date or slot
  Then the existing assignment becomes `superseded` with a timestamp
  And a new `active` assignment is created
  And exactly one assignment for that job is `active` afterwards

- **AC-2** Given the new technician already has an `active` assignment in that slot
  Then 409, the original assignment stays `active`, and nothing is superseded

- **AC-3** Given a superseded assignment occupying the same `(technician, date, slot)`
  Then it does **not** block a new active assignment for that slot

- **AC-4** Given a `completed`, `invoiced` or `cancelled` job
  Then 409

- **AC-5** Given a technician actor
  Then 403

<details><summary><strong>Why AC-3 is a criterion rather than an implementation note</strong></summary>

It is the exact failure a plain unique index causes: after one reassignment the superseded row keeps
its key, and that technician's slot is unusable forever. The index must be partial — scoped to
`status: "active"` — and AC-3 is what proves it.
</details>

**Estimate:** M

### BE-05-03 — Dispatch a scheduled job

**Source:** `proc-job-lifecycle` · interview §3.3 — "dispatched — the dispatcher sends it to the
technician's queue."

**Acceptance criteria**

- **AC-1** Given a dispatcher and a `scheduled` job
  When they dispatch it
  Then status becomes `dispatched` and it appears in that technician's queue

- **AC-2** Given a job not `scheduled`
  Then 409 and no change

- **AC-3** Given an already-`dispatched` job
  Then 200 and no change *(idempotent)*

- **AC-4** Given a technician actor
  Then 403

**Estimate:** S

### BE-05-04 — Technician availability for a date

**As a** dispatcher
**I want** to see which technicians are free in which slots on a date
**So that** I can assign without guessing and being rejected

**Source:** `con-no-double-booking` · interview §4.2

**Acceptance criteria**

- **AC-1** Given a dispatcher and a date
  Then each active technician's three slots are returned marked free or taken, with the job id where
  taken

- **AC-2** Given deactivated technicians
  Then they are excluded

- **AC-3** Given the query
  Then it is covered by an index on `(technician, date)` and issues **one** query, not one per
  technician

- **AC-4** Given a technician actor
  Then 403 — a technician does not see colleagues' schedules

**Estimate:** M
**Notes:** AC-3 exists because the naive implementation is a loop over technicians — an N+1 that is
fine with three technicians and unusable with three hundred.

### BE-05-05 — Unschedule a job

**Acceptance criteria**

- **AC-1** Given a dispatcher and a `scheduled` or `dispatched` job
  When they unschedule it
  Then the `active` assignment becomes `superseded`, the slot is freed, and the job returns to
  `raised`

- **AC-2** Given an `in_progress`, `completed` or `invoiced` job
  Then 409

- **AC-3** Given a job with no active assignment
  Then 200 and no change *(idempotent)*

- **AC-4** Given a technician actor
  Then 403

**Estimate:** S
**Notes:** not stated in the interview — derived as the inverse of BE-05-01 and needed by BE-03-05
AC-2, which returns jobs to a state requiring scheduling. **Flagged to the gate as derived scope,
not sourced scope.**
