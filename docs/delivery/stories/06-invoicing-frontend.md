---
epic: FE-06
title: Invoicing — client
unit: frontend
status: draft
approved_by:
approved_on:
graph_entities: [ent-invoice, ent-invoice-line]
depends_on: [BE-06, FE-01]
---

**Out of scope:** payment collection (`ng-payments`), PDF download (`ng-pdf-tax`).

---

### FE-06-01 — Invoice list

**Acceptance criteria**

- **AC-1** Given a dispatcher
  Then invoices are listed with customer, job, total and status, paginated and filterable by status

- **AC-2** Given loading, empty and error
  Then each is a distinct visible state

- **AC-3** Given a technician
  Then this view is not reachable, matching BE-06-02 AC-4

**Estimate:** S

### FE-06-02 — Invoice detail, mark paid and void

**Acceptance criteria**

- **AC-1** Given an invoice
  Then its lines, total and status are shown, with the total displayed as returned by the server and
  not recomputed client-side

- **AC-2** Given an `unpaid` invoice
  Then mark-paid and void are offered; on a `paid` or `void` invoice the unavailable actions are not

- **AC-3** Given a void
  Then a confirmation states that the invoice is retained and marked void, not deleted

- **AC-4** Given no download control anywhere in the view
  Then that is correct — `ng-pdf-tax`

**Estimate:** S
**Notes:** AC-1 prevents the classic divergence where the client's rounding differs from the
server's and two different totals appear in the product.
