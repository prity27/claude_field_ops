---
epic: BE-04
title: Job lifecycle
unit: backend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [ent-job, proc-job-lifecycle, con-ordered-transitions, con-technician-scope, rel-customer-jobs]
depends_on: [BE-02, BE-03]
---

The state machine at the centre of the product:

```
raised → scheduled → dispatched → in_progress → completed → invoiced
                                                    ↓
cancelled ← (any state before completed)         reopen → in_progress   (dispatcher only)
```

`scheduled` and `dispatched` are owned by **BE-05 scheduling**, because both follow from an
assignment. This epic owns everything else.

Transitions are **ordered** — a job never skips a state (`con-ordered-transitions` · interview §3.4).

---

### BE-04-01 — Raise a job

**Source:** `ent-job`, `rel-customer-jobs` · interview §3.3 — "raised — the dispatcher creates it
against a customer."

**Acceptance criteria**

- **AC-1** Given a dispatcher, an active customer and a description
  When they raise a job
  Then it is created with status `raised` and linked to that customer

- **AC-2** Given an archived customer
  Then the request fails with 409 and no job is created

- **AC-3** Given a missing customer or description
  Then 400 naming the field

- **AC-4** Given a technician
  Then 403 and the attempt is audited

- **AC-5** Given a body with extra fields (`status`, `completionNotes`, `_id`)
  Then they are ignored — status is set by the system, never by the client

<details><summary><strong>Why AC-5 singles out <code>status</code></strong></summary>

If `status` is client-settable, the entire ordered state machine is decoration — a caller posts
`status: "completed"` and skips every rule in this epic. It is the mass-assignment defect with the
highest blast radius here.
</details>

**Estimate:** M

### BE-04-02 — Read one job

**Acceptance criteria**

- **AC-1** Given a dispatcher and an existing id
  Then the job is returned with its customer, current assignment and status

- **AC-2** Given a missing id
  Then 404

- **AC-3** Given a technician and a job assigned to a different technician
  Then **404** — see BE-01-07 AC-1

- **AC-4** Given a technician and their own job
  Then it is returned

**Estimate:** S

### BE-04-03 — List jobs

**Acceptance criteria**

- **AC-1** Given a dispatcher
  Then all jobs are listed, paginated, with an enforced maximum page size

- **AC-2** Given a technician
  Then only jobs with an `active` assignment to them are listed — no other job appears in any page

- **AC-3** Given filters on status, customer, date or technician
  Then each is supported and each filtered field is indexed

- **AC-4** Given no explicit sort
  Then the order is deterministic with ties broken by `_id`

- **AC-5** Given a technician passing a `technician` filter naming someone else
  Then the filter cannot widen their scope — the result is still only their own jobs

<details><summary><strong>Why AC-5 exists</strong></summary>

Scoping applied as a default filter rather than a hard constraint is bypassable by supplying the
parameter explicitly. The scope must be intersected with the caller's permission, never replaced
by request input.
</details>

**Estimate:** M

### BE-04-04 — Start a job

**Source:** `proc-job-lifecycle` · interview §3.3 — "in_progress — the technician starts it, on site."

**Acceptance criteria**

- **AC-1** Given a technician and a `dispatched` job assigned to them
  When they start it
  Then status becomes `in_progress` and the start time and actor are recorded

- **AC-2** Given a job in any state other than `dispatched`
  Then 409, the standard envelope, and the state is unchanged

- **AC-3** Given a technician and a job assigned to someone else
  Then 404 and no state change

- **AC-4** Given a job already `in_progress`
  When started again
  Then 200 and no change *(idempotent)*

- **AC-5** Given a dispatcher
  Then they cannot start a job — this transition belongs to the technician

**Estimate:** M

### BE-04-05 — Complete a job

**Source:** `proc-job-lifecycle` · interview §3.3 — "completed — the technician closes it, with notes."

**Acceptance criteria**

- **AC-1** Given a technician and an `in_progress` job assigned to them, with notes supplied
  When they complete it
  Then status becomes `completed`, and the notes, completion time and actor are recorded

- **AC-2** Given no notes
  Then 400 — notes are required, per §3.3

- **AC-3** Given a job not `in_progress`
  Then 409 and no change

- **AC-4** Given a job assigned to another technician
  Then 404

- **AC-5** Given a job already `completed`
  When completed again
  Then 200 and no change *(idempotent)*

**Estimate:** M
**Status: BLOCKED — `q-completion-requirements`.** Whether completion also requires a photo, a
customer signature, parts used or time on site is unanswered. Each would add a required field and
an AC; a photo additionally brings file upload and its own OWASP surface. **Do not build this story
until the question is answered** — the alternative is building it twice.

### BE-04-06 — Cancel a job

**Source:** `con-ordered-transitions` · interview §9.2 — "Only a dispatcher may cancel a job. A
technician cannot. ... The reason is required, not optional"

**Acceptance criteria**

- **AC-1** Given a dispatcher and a job in any state before `completed`
  When they cancel it with a reason
  Then status becomes `cancelled` and the reason, actor and timestamp are recorded
  And any `active` assignment for that job becomes `superseded`, freeing the slot

- **AC-2** Given no reason supplied
  Then 400 — the reason is required

- **AC-3** Given a `completed` or `invoiced` job
  When cancellation is attempted
  Then 409 and no change — a completed job cannot be cancelled (§3.2)

- **AC-4** Given a technician
  Then 403 and the attempt is audited

- **AC-5** Given an already-cancelled job
  When cancelled again
  Then 200 and no change *(idempotent)*

**Estimate:** M
**Notes:** AC-1 is a multi-document write — job status plus assignment supersession. Atomicity is a
`/design-schema` question. Leaving the assignment active would keep the technician's slot blocked
for work that will never happen.

### BE-04-07 — Reopen a completed job

**Source:** `proc-job-lifecycle` · interview §8.3 — "A dispatcher can move a completed job back to
in_progress with a recorded reason and actor. ... If the job was already invoiced, the invoice is
voided first."

**Acceptance criteria**

- **AC-1** Given a dispatcher and a `completed` job with no invoice
  When they reopen it with a reason
  Then status returns to `in_progress`, and the reason, actor and timestamp are recorded

- **AC-2** Given a dispatcher and an `invoiced` job
  When they reopen it
  Then the invoice is voided **first**, and only then does the job return to `in_progress`
  And if voiding fails, the job status is unchanged

- **AC-3** Given no reason supplied
  Then 400

- **AC-4** Given a technician
  Then 403 and the attempt is audited — a technician cannot reopen (§8.3)

- **AC-5** Given a job that is not `completed` or `invoiced`
  Then 409 and no change

- **AC-6** Given a reopened job
  Then its original assignment remains attached — reopening does not unschedule the work

<details><summary><strong>Why AC-2 orders the two writes explicitly</strong></summary>

If the job is reopened first and the void then fails, the system holds an `in_progress` job with a
live invoice against it — billable work that is not finished. The stated order fails safe: worst
case the invoice is voided and the reopen does not happen, which is visible and correctable.
</details>

**Estimate:** M
**Notes:** AC-6 is an inference, not a statement — §8.3 says nothing about the assignment. Recorded
as a decision to confirm at the gate rather than left silent.
