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
