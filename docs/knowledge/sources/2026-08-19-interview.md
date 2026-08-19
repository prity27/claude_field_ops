# Scope interview — FieldOps

Kind: `interview` · Date: 2026-08-19 · Authority: medium
Participants: project owner (prity27) · Interviewer: Claude, `/ingest-knowledge` interview mode

> Recorded because no pre-sales material exists for this project. Memory is not a document, so this
> digest ranks below a signed proposal and above a passing remark. Every graph claim citing it
> quotes a numbered line below.

## 1. What the product is

1.1 FieldOps schedules field-service work. Customers have jobs that need doing at their site; a
dispatcher decides who does each one and when; a technician does it and closes it out; completed
work is billed.

1.2 It is an internal tool for the service company. It is not a marketplace and not a customer-
facing product.

## 2. Actors

2.1 "Two roles log in: dispatcher and technician."

2.2 A **dispatcher** has full visibility of all jobs. They create jobs, schedule them against a
technician and a time slot, and dispatch them.

2.3 A **technician** sees **only the jobs assigned to them**. They start a job when they arrive on
site and complete it with notes. They cannot see another technician's jobs.

2.4 "Customers do not log in." A customer is a record the dispatcher maintains, not an account.
Jobs are raised by the dispatcher on the customer's behalf.

## 3. The job lifecycle

3.1 A job moves through: `raised` → `scheduled` → `dispatched` → `in_progress` → `completed` →
`invoiced`.

3.2 `cancelled` is reachable from any state **before** `completed`. A completed job cannot be
cancelled.

3.3 Who moves it:

- `raised` — the dispatcher creates it against a customer.
- `scheduled` — the dispatcher picks a technician and a time slot.
- `dispatched` — the dispatcher sends it to the technician's queue.
- `in_progress` — the **technician** starts it, on site.
- `completed` — the **technician** closes it, with notes.
- `invoiced` — the billing run picks it up; not a human action on the job itself.

3.4 The transitions are ordered. A job does not skip from `raised` to `in_progress`.

## 4. Scheduling rules

4.1 "One technician per job."

4.2 "One job per technician per time slot" — a technician **cannot be double-booked**. An
assignment that overlaps an existing assignment for that technician must be **rejected**, not
warned about.

4.3 This is the central invariant of the product. Two dispatchers assigning the same technician to
overlapping slots at the same moment must not both succeed.

## 5. Invoicing

5.1 Invoicing is **in scope**, internal only.

5.2 A completed job produces an invoice record with line items and a total.

5.3 An invoice can be marked paid.

5.4 Explicitly **not** in scope: any payment provider or card processing, PDF generation, and tax
calculation.

## 6. Non-goals, stated

6.1 No customer login and no customer portal.

6.2 No payment processing.

6.3 No mobile application — technicians use the web client.

## 7. What the interview did not settle

Recorded here so the graph does not invent answers. Each is an open question.

7.1 Whether a dispatched or in-progress job can be reassigned to a different technician, and what
happens to the original assignment.

7.2 What a time slot actually is — a fixed grid (e.g. hourly, or morning/afternoon), or an
arbitrary start and end datetime chosen per job.

7.3 Whether completing a job requires anything beyond notes — a photo, a customer signature, parts
used, time on site.

7.4 What happens to an invoice if a completed job is later found to be wrong. Completed jobs cannot
be cancelled (3.2), so there is no stated correction path.

7.5 Whether a job can exist without a customer, and whether a customer can be deleted while they
have open jobs.

7.6 Retention and residency for customer addresses and technician scheduling data — both are
personal data.

7.7 How a technician is deactivated when they leave, and what happens to their future assignments.

## 8. Follow-up answers — 2026-08-19, same day

Answers to the open questions raised in §7, given by the project owner after reviewing the graph.
These resolve q-slot-shape, q-reassignment and q-completed-correction.

### 8.1 Time slots are a fixed grid

A slot is not an arbitrary datetime range. An assignment is `(technician, date, slot)` where slot is
one of `morning`, `afternoon`, `evening`.

"Double-booking becomes a unique index on (technician, date, slot)" — the database enforces the
invariant, and two dispatchers assigning the same technician to the same slot concurrently is
resolved by the second write failing on the duplicate key. The service catches that and returns 409.

A job occupies exactly one slot. Jobs spanning consecutive slots were considered and **not** chosen.

### 8.2 Jobs can be reassigned, and the history is kept

A dispatched or in-progress job can be moved to a different technician. The previous assignment is
**not** overwritten: it is marked superseded and a new active assignment is created.

"Job ↔ Assignment becomes 1:N with exactly one active."

The reason given: technicians call in sick, and the history is what lets you answer "who was meant
to do this". The uniqueness rule applies to active assignments only — a superseded assignment must
not block the slot.

### 8.3 A completed job can be reopened, by a dispatcher only

"A dispatcher can move a completed job back to in_progress with a recorded reason and actor."

A technician cannot reopen. If the job was already `invoiced`, **the invoice is voided first** —
reopening an invoiced job without voiding its invoice is not permitted.

This supersedes nothing in §3.2: a completed job still cannot be *cancelled*. Reopening is a
distinct transition with a distinct owner.

### 8.4 Team

Experience level: **mixed**. Domain expertise was not stated.

## 9. Follow-up answers — 2026-08-19, during epic planning

Given by the project owner while agreeing the epic cut. Resolves q-slot-capacity, q-cancel-reason,
q-customer-deletion and q-technician-deactivation.

### 9.1 One job per slot is a hard limit

"No, hard limit." A dispatcher cannot override and put two jobs in one technician's slot under any
circumstance.

This confirms and preserves the §8.1 decision: the unique partial index **is** the rule. No
application-level concurrency handling is required beyond translating the duplicate-key failure
into a 409.

### 9.2 Cancellation is dispatcher-only and requires a reason

Only a dispatcher may cancel a job. A technician cannot. Cancelling records a reason and the
actor, exactly as reopening does (§8.3).

The reason is **required**, not optional — "an optional reason field is one nobody fills in, and
the cancellation history becomes useless within a month."

### 9.3 Customers and technicians are soft-deleted, never removed

Neither is ever hard-deleted, because invoicing needs the history.

- A **customer** is archived. Archiving is **blocked while the customer has open jobs** — open
  meaning any status other than `completed`, `invoiced` or `cancelled`.
- A **technician** is deactivated. On deactivation, their future `active` assignments are marked
  superseded and **surfaced to the dispatcher for reassignment** rather than silently dropped.

An archived customer and a deactivated technician must not appear in selection lists for new work,
but must still resolve on existing records.
