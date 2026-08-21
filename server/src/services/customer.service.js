import mongoose from 'mongoose';
import { Customer } from '../models/Customer.js';
import { Job } from '../models/Job.js';
import { Technician } from '../models/Technician.js';
import { AppError } from '../middleware/errorHandler.js';
import { hasRole } from '../middleware/authorize.js';
import * as audit from './audit.service.js';

/**
 * BE-02 — the customer registry. Customers are records, never accounts: nothing in here creates a
 * credential (`dec-no-customer-login`, interview §2.4).
 *
 * Two rules run through every function below.
 *
 * 1. **Scope, not filter.** A technician reaches only the customers attached to a job assigned to
 *    them (BE-02-02 AC-3, extending `con-technician-scope`). Anything outside that set answers
 *    404, not 403 — a 403 confirms the id exists, which is the enumeration half of the IDOR the
 *    scoping is there to prevent.
 * 2. **Archive, never delete.** `con-soft-delete`. There is no hard-delete path at any layer, so
 *    BE-02-05 AC-5 holds by construction rather than by a check someone can forget.
 */

// BE-02-03 AC-1 requires the maximum page size to be documented. Exported so that the route
// declares its own bound from the same constant docs/API.md quotes, rather than a copy of it.
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * The statuses that mean a job is finished with. Everything else still needs doing and so blocks
 * archiving (BE-02-05 AC-2).
 *
 * Written as "not closed" rather than as a list of open statuses on purpose: when a later epic
 * adds a status, it counts as blocking until someone decides otherwise. The other way round, a new
 * status would silently let an archive through and take its open jobs with it.
 */
const CLOSED_JOB_STATUSES = ['completed', 'invoiced', 'cancelled'];

const notFound = () => new AppError(404, 'customer_not_found', 'No such customer');

function publicCustomer(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    siteAddress: doc.siteAddress,
    contactPhone: doc.contactPhone,
    contactEmail: doc.contactEmail,
    // BE-02-02 AC-4: the response says so, rather than leaving a caller to infer it from a
    // missing record.
    archived: doc.archived,
    archivedAt: doc.archivedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * `req.actor.id` is a User id; `Job.assignedTechnician` is a Technician id. The two are separate
 * by design (SCHEMA.md — Assignment references a resource, not a login), so a technician's scope
 * is only resolvable through this hop. A user with no Technician row has an empty scope, not an
 * unscoped one.
 */
async function technicianIdFor(actor) {
  const technician = await Technician.findOne({ user: actor.id }).select('_id').lean();
  return technician?._id ?? null;
}

async function reachableByTechnician(customerId, actor) {
  const technicianId = await technicianIdFor(actor);
  if (!technicianId) return false;
  return Boolean(await Job.exists({ customer: customerId, assignedTechnician: technicianId }));
}

/**
 * BE-02-01. The field whitelist is this destructure — it lives in the service rather than only in
 * the router so that no future caller can widen it by handing over a fuller object (AC-4).
 */
export async function create({ name, siteAddress, contactPhone, contactEmail }) {
  const customer = await Customer.create({
    name,
    siteAddress,
    contactPhone: contactPhone ?? null,
    contactEmail: contactEmail ?? null,
  });

  // Deliberately not audited. BE-01-08 AC-1 lists the actions that carry an audit entry and
  // creating a customer is not among them, so adding one would mean adding to AUDIT_ACTIONS —
  // scope for the audit story, not a default to invent here.
  return publicCustomer(customer);
}

/** BE-02-02. */
export async function readOne(id, actor) {
  // A malformed id is a customer that does not exist, not a 500. Without this, `findById` throws
  // a CastError and the error handler turns it into an internal error.
  if (!mongoose.Types.ObjectId.isValid(id)) throw notFound();

  const customer = await Customer.findById(id);
  if (!customer) throw notFound();

  if (hasRole(actor, 'technician') && !(await reachableByTechnician(customer._id, actor))) {
    throw notFound();
  }

  return publicCustomer(customer);
}

/** BE-02-03. */
export async function list({ page = 1, pageSize = DEFAULT_PAGE_SIZE, includeArchived = false }, actor) {
  // AC-5: an over-sized page is capped. The route clamps too; this is the backstop for a caller
  // that reaches the service directly.
  const size = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const current = Math.max(Number(page) || 1, 1);

  const filter = {};
  // AC-3: archived customers are out unless they are explicitly asked for.
  if (!includeArchived) filter.archived = false;

  if (hasRole(actor, 'technician')) {
    // AC-4. Bounded by the technician's own job count, which is small by construction — one
    // active assignment per slot per day (Assignment's unique index). A dispatcher's list, which
    // is the one that grows without limit, never takes this path.
    const technicianId = await technicianIdFor(actor);
    const reachable = technicianId
      ? await Job.distinct('customer', { assignedTechnician: technicianId })
      : [];
    if (reachable.length === 0) return emptyPage(current, size);
    filter._id = { $in: reachable };
  }

  const [docs, total] = await Promise.all([
    Customer.find(filter)
      // AC-2. `name` is not unique, so `_id` breaks the tie. Without the tiebreak two customers
      // sharing a name can swap places between the query for page 1 and the query for page 2,
      // and one of them is then never returned at all.
      .sort({ name: 1, _id: 1 })
      .skip((current - 1) * size)
      .limit(size),
    Customer.countDocuments(filter),
  ]);

  return {
    customers: docs.map(publicCustomer),
    page: {
      page: current,
      pageSize: size,
      total,
      totalPages: Math.max(Math.ceil(total / size), 1),
      maxPageSize: MAX_PAGE_SIZE,
    },
  };
}

function emptyPage(page, pageSize) {
  return {
    customers: [],
    page: { page, pageSize, total: 0, totalPages: 1, maxPageSize: MAX_PAGE_SIZE },
  };
}

/** BE-02-04. */
export async function update(id, patch) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw notFound();

  const fields = Object.keys(patch);
  if (fields.length === 0) {
    throw new AppError(400, 'invalid_body', 'At least one field to update is required');
  }

  // AC-4: last-write-wins, stated in docs/API.md rather than left to chance. `$set` of only the
  // fields present means two concurrent updates to different fields both survive; two to the same
  // field resolve to whichever reached MongoDB second.
  let customer;
  try {
    customer = await Customer.findByIdAndUpdate(
      id,
      { $set: patch },
      // runValidators, because findByIdAndUpdate skips schema validation by default — without it
      // the model's own caps would hold on create and quietly not on update.
      { new: true, runValidators: true },
    );
  } catch (err) {
    // A schema violation is the caller's fault, so it must not surface as a 500. Mongoose is the
    // only thing that can raise one here; anything else is genuinely internal and rethrows.
    if (err.name !== 'ValidationError') throw err;
    throw new AppError(400, 'invalid_body', err.message);
  }
  if (!customer) throw notFound();

  return publicCustomer(customer);
}

/** BE-02-05. */
export async function archive(id, actor) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw notFound();

  const customer = await Customer.findById(id);
  if (!customer) throw notFound();

  // AC-4 is checked before AC-2, deliberately. An already-archived customer answers 200 and
  // unchanged even if a job has since been raised against it; running the open-job check first
  // would make the idempotent repeat fail with a 409, which AC-4 forbids.
  if (customer.archived) return publicCustomer(customer);

  const openJobs = await Job.countDocuments({
    customer: customer._id,
    status: { $nin: CLOSED_JOB_STATUSES },
  });
  if (openJobs > 0) {
    // AC-2: the message names how many open jobs block it, so a dispatcher knows whether they are
    // one job away or twenty.
    throw new AppError(
      409,
      'customer_has_open_jobs',
      `Cannot archive: ${openJobs} open job${openJobs === 1 ? '' : 's'} must be completed or `
        + 'cancelled first',
    );
  }

  // A job raised between the count above and the save below would leave an archived customer with
  // one open job. The window closes from the other side, not here: BE-02-05 AC-3 requires job
  // creation to refuse an archived customer, so once BE-04 lands there is no ordering that
  // produces the pair. Guarding it here instead would need a lock on a collection this service
  // does not own.
  customer.archived = true;
  customer.archivedAt = new Date();
  await customer.save();

  await audit.record({
    actor: actor.id,
    action: 'customer.archived',
    targetType: 'Customer',
    targetId: customer._id,
    outcome: 'success',
    // No name, no address, no contact detail: BE-01-08 AC-3. The target id is enough to find the
    // record, and the record is retained.
  });

  return publicCustomer(customer);
}
