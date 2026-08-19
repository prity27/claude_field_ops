---
epic: FE-05
title: Scheduling — client
unit: frontend
status: approved
approved_by: prity27
approved_on: 2026-08-19
graph_entities: [ent-assignment, con-no-double-booking]
depends_on: [BE-05, FE-04]
---

### FE-05-01 — Day schedule board

**Source:** `con-no-double-booking` · interview §4.2

**Acceptance criteria**

- **AC-1** Given a dispatcher and a date
  Then a grid of technicians against the three slots shows what is booked and what is free

- **AC-2** Given a taken slot
  Then it shows the job and customer, and links to the job

- **AC-3** Given loading, empty and error
  Then each is a distinct visible state

- **AC-4** Given the selected date
  Then it is in the URL, so a day view can be shared

**Estimate:** M
**Notes:** built on BE-05-04's single availability call, not by fetching per technician.

### FE-05-02 — Assign and reassign

**Acceptance criteria**

- **AC-1** Given an unscheduled job
  Then the dispatcher can pick a technician, date and slot, with taken slots shown as unavailable

- **AC-2** Given the server returns 409 because the slot was taken between load and submit
  Then the conflict is shown clearly, the grid refreshes, and **no silent retry happens**

- **AC-3** Given a reassignment
  Then the confirmation states which technician loses the job and which gains it

- **AC-4** Given a deactivated technician
  Then they do not appear in the picker

<details><summary><strong>Why AC-2 forbids a silent retry</strong></summary>

The 409 means someone else took that slot in the intervening seconds. Retrying automatically either
fails again or, worse, succeeds against a slot the dispatcher never looked at. The human needs to
see the board changed under them.
</details>

**Estimate:** M

### FE-05-03 — Unschedule

**Acceptance criteria**

- **AC-1** Given a scheduled or dispatched job
  Then the dispatcher can unschedule it, confirming first

- **AC-2** Given the job returns to `raised`
  Then both the job board and the day grid reflect the freed slot without a full reload

**Estimate:** S
