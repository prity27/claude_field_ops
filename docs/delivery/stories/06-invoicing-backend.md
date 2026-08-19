---
epic: BE-06
title: Invoicing
unit: backend
status: draft
approved_by:
approved_on:
graph_entities: [ent-invoice, ent-invoice-line, proc-invoice-generation, rel-job-invoice, rel-invoice-lines]
depends_on: [BE-04]
---

Internal invoicing only.

**Out of scope for the whole epic, explicitly:** any payment provider or card processing
(`ng-payments`), PDF generation and tax calculation (`ng-pdf-tax`) · interview §5.4. A story
proposing any of these is inventing scope.

**This epic has three open questions against it.** Two of its five stories are blocked. It is drafted
in full so the gate can see the shape, but it should be approved last.

---

### BE-06-01 — Generate an invoice from a completed job

**Source:** `proc-invoice-generation` · interview §5.2 — "A completed job produces an invoice record
with line items and a total."

**Acceptance criteria**

- **AC-1** Given a `completed` job with no existing invoice
  When an invoice is generated
  Then an invoice is created `unpaid` with its lines and a total, linked to the job and customer
  And the job status becomes `invoiced`

- **AC-2** Given the total
  Then it equals the sum of `quantity × unitPrice` across its lines, and this is asserted by a test

- **AC-3** Given a job not `completed`
  Then 409 and no invoice is created

- **AC-4** Given a job that already has a non-void invoice
  Then 409 and no second invoice is created

- **AC-5** Given a technician actor
  Then 403

**Estimate:** M
**Status: BLOCKED — `q-invoice-pricing`.** Where line prices come from — typed by the dispatcher, a
rate card, or derived from time on site — is unanswered, and every attribute of `InvoiceLine` is
currently `implied` rather than stated. A rate card would be an entity nobody has mentioned.
**Notes:** AC-1 is a multi-document write across invoice, lines and job. Atomicity is a
`/design-schema` question; a created invoice with the job left `completed` would be re-invoiced by
the next run.

### BE-06-02 — Read and list invoices

**Acceptance criteria**

- **AC-1** Given a dispatcher and an invoice id
  Then the invoice is returned with its lines, total, status and job

- **AC-2** Given a missing id
  Then 404

- **AC-3** Given a dispatcher
  Then invoices are listed paginated, with an enforced maximum page size, filterable by status and
  customer, deterministically sorted

- **AC-4** Given a technician actor
  Then 403 — invoicing is not a technician surface

**Estimate:** S

### BE-06-03 — Mark an invoice paid

**Source:** `ent-invoice` · interview §5.3 — "An invoice can be marked paid."

**Acceptance criteria**

- **AC-1** Given a dispatcher and an `unpaid` invoice
  When they mark it paid
  Then status becomes `paid` and the actor and timestamp are recorded

- **AC-2** Given a `void` invoice
  Then 409 — a voided invoice cannot be paid

- **AC-3** Given an already-`paid` invoice
  Then 200 and no change *(idempotent)*

- **AC-4** Given a technician actor
  Then 403

- **AC-5** Given any request to record a card payment or payment-provider reference
  Then no such field or endpoint exists — `ng-payments`

**Estimate:** S

### BE-06-04 — Void an invoice

**Source:** `proc-job-lifecycle` · interview §8.3 — "If the job was already invoiced, the invoice is
voided first."

**Acceptance criteria**

- **AC-1** Given a dispatcher and an `unpaid` invoice
  When they void it
  Then status becomes `void` and the actor and timestamp are recorded
  And the invoice and its lines are retained, never deleted

- **AC-2** Given a reopen of an invoiced job (BE-04-07 AC-2)
  Then this same void path runs, and the audit entry records that it was triggered by a reopen

- **AC-3** Given an already-`void` invoice
  Then 200 and no change *(idempotent)*

- **AC-4** Given a technician actor
  Then 403

**Estimate:** M
**Status: BLOCKED — `q-void-invoice-rules`.** Whether a **paid** invoice may be voided, whether a
reason is required, and who besides a dispatcher may void are all unanswered. Voiding a paid invoice
is a money-affecting action with no stated owner, so it is not being guessed at.

### BE-06-05 — Re-invoice a reopened job

**Acceptance criteria**

- **AC-1** Given a job that was reopened after being invoiced, and is now `completed` again
  When an invoice is generated
  Then a new invoice is created and linked to the voided one it supersedes

- **AC-2** Given the voided invoice
  Then it remains readable and clearly marked superseded

- **AC-3** Given a job whose only prior invoice is `void`
  Then BE-06-01 AC-4 does not block generation

**Estimate:** M
**Status: BLOCKED — `q-reopen-reinvoice`.** Whether re-completion generates a new invoice
automatically and what links it to the voided one is unanswered. Without it, a re-completed job
either silently skips invoicing or creates an unlinked duplicate — and both are invisible until
someone reconciles the books.
