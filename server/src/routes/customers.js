import { Router } from 'express';
import * as customers from '../services/customer.service.js';
import { rejectFields, validateBody, validateQuery } from '../middleware/validate.js';
import { requireRole } from '../middleware/authorize.js';

export const customersRouter = Router();

/**
 * BE-02 — the customer registry.
 *
 * Permissions are declared here, at the route, readable without opening a handler
 * (BE-01-06 AC-2). Writing a customer is a dispatcher's job and says so in one line. Reading is
 * open to both roles because a technician's answer depends on their own assignments rather than
 * on their role alone — that scoping lives in the service, where BE-02-02 AC-3 can be read next
 * to the query it constrains.
 *
 * There is no DELETE. `con-soft-delete` — BE-02-05 AC-5 is satisfied by the absence, so the
 * unknown-route 404 is the whole of the answer.
 */

const WRITABLE_FIELDS = {
  name: { required: true, type: 'string', maxLength: 160 },
  siteAddress: { required: true, type: 'string', maxLength: 500 },
  contactPhone: { type: 'string', maxLength: 40 },
  contactEmail: { type: 'string', maxLength: 254 },
};

// The same fields, none of them mandatory — BE-02-04 AC-1 is a partial update. Derived rather than
// retyped so the two specs cannot drift apart.
const PATCHABLE_FIELDS = Object.fromEntries(
  Object.entries(WRITABLE_FIELDS).map(([field, rule]) => [field, { ...rule, required: false }]),
);

customersRouter.post(
  '/customers',
  requireRole('dispatcher'),
  validateBody(WRITABLE_FIELDS),
  async (req, res, next) => {
    try {
      const customer = await customers.create(req.validated);
      res.status(201).json({ customer });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  '/customers',
  validateQuery({
    page: { type: 'integer', min: 1, clamp: true, default: 1 },
    // BE-02-03 AC-5: over the maximum is clamped to it, which is why this rule carries `clamp`
    // and not just `max`.
    pageSize: {
      type: 'integer',
      min: 1,
      max: customers.MAX_PAGE_SIZE,
      clamp: true,
      default: customers.DEFAULT_PAGE_SIZE,
    },
    includeArchived: { type: 'boolean', default: false },
  }),
  async (req, res, next) => {
    try {
      res.status(200).json(await customers.list(req.validatedQuery, req.actor));
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get('/customers/:id', async (req, res, next) => {
  try {
    const customer = await customers.readOne(req.params.id, req.actor);
    res.status(200).json({ customer });
  } catch (err) {
    next(err);
  }
});

customersRouter.patch(
  '/customers/:id',
  requireRole('dispatcher'),
  // BE-02-04 AC-2: archiving is BE-02-05 and has its own rules, so an attempt to reach it through
  // here is refused rather than quietly dropped.
  rejectFields('archived', 'archivedAt'),
  validateBody(PATCHABLE_FIELDS),
  async (req, res, next) => {
    try {
      const customer = await customers.update(req.params.id, req.validated);
      res.status(200).json({ customer });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/customers/:id/archive',
  requireRole('dispatcher'),
  async (req, res, next) => {
    try {
      const customer = await customers.archive(req.params.id, req.actor);
      res.status(200).json({ customer });
    } catch (err) {
      next(err);
    }
  },
);
