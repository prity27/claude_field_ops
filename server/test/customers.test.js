import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { AuditLog } from '../src/models/AuditLog.js';
import { Customer } from '../src/models/Customer.js';
import { Job } from '../src/models/Job.js';
import { Technician } from '../src/models/Technician.js';
import { asDispatcher, asTechnician, createApp, uniqueEmail } from './support/harness.js';
import './support/hooks.js';

/**
 * BE-02 — the customer registry.
 *
 * Every test is named for the acceptance criterion it proves, so `/validate-delivery` can grep for
 * an AC id rather than form an opinion.
 */

const app = createApp();

function validBody(overrides = {}) {
  return {
    name: 'Northgate Dental',
    siteAddress: '14 Northgate Road, Leeds LS1 4AA',
    contactPhone: '+44 113 496 0100',
    contactEmail: 'facilities@northgate.test',
    ...overrides,
  };
}

async function seedCustomer(overrides = {}) {
  return Customer.create({
    name: 'Seeded Customer',
    siteAddress: '1 Seed Street',
    ...overrides,
  });
}

/**
 * A technician's scope is Job.assignedTechnician, which is a Technician id rather than a User id.
 * Seeding both halves is what makes the scoping tests exercise the real hop instead of a
 * short-circuit.
 */
async function seedAssignedTechnician(user, customer, { status = 'raised' } = {}) {
  const technician = await Technician.create({
    user: user._id,
    name: user.name,
    email: user.email,
  });
  const job = await Job.create({
    customer: customer._id,
    description: 'Annual service',
    status,
    assignedTechnician: technician._id,
  });
  return { technician, job };
}

// -----------------------------------------------------------------------------------------------
// BE-02-01 — Create a customer
// -----------------------------------------------------------------------------------------------

describe('BE-02-01 — create a customer', () => {
  it('BE-02-01 AC-1 — a dispatcher creating a valid customer gets 201 and the record in the standard envelope', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const body = validBody();

    const res = await request(app)
      .post('/api/customers')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(body);

    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.body), ['customer']);
    assert.equal(res.body.customer.name, body.name);
    assert.equal(res.body.customer.siteAddress, body.siteAddress);
    assert.equal(res.body.customer.archived, false);
    assert.equal(res.body.customer.archivedAt, null);

    // It reached the database, not only the response.
    const stored = await Customer.findById(res.body.customer.id);
    assert.equal(stored.name, body.name);
    assert.equal(stored.archived, false);
  });

  it('BE-02-01 AC-1 — contact details are optional and come back as null when omitted', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/customers')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ name: 'Site Only', siteAddress: '2 Only Road' });

    assert.equal(res.status, 201);
    assert.equal(res.body.customer.contactPhone, null);
    assert.equal(res.body.customer.contactEmail, null);
  });

  it('BE-02-01 AC-2 — a missing name is refused with 400 naming the field', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/customers')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ name: undefined }));

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
    assert.match(res.body.error.message, /name/);
    assert.equal(await Customer.countDocuments({}), 0);
  });

  it('BE-02-01 AC-2 — a missing site address is refused with 400 naming the field', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post('/api/customers')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ siteAddress: undefined }));

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
    assert.match(res.body.error.message, /siteAddress/);
    assert.equal(await Customer.countDocuments({}), 0);
  });

  it('BE-02-01 AC-3 — a technician attempting to create a customer gets 403 and the attempt is audited', async () => {
    const { user, cookieHeader, csrf } = await asTechnician();

    const res = await request(app)
      .post('/api/customers')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody());

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
    assert.equal(await Customer.countDocuments({}), 0);

    const [entry] = await AuditLog.find({ action: 'authorization.denied' });
    assert.ok(entry, 'the denied attempt was not audited');
    assert.equal(entry.outcome, 'denied');
    assert.equal(entry.actor.toString(), user._id.toString());
    assert.equal(entry.metadata.method, 'POST');
    assert.equal(entry.metadata.path, '/customers');
  });

  it('BE-02-01 AC-4 — archived, _id and createdAt in the body are ignored rather than honoured', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const plantedId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .post('/api/customers')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(
        validBody({
          archived: true,
          archivedAt: '2020-01-01T00:00:00.000Z',
          _id: plantedId,
          createdAt: '1999-12-31T00:00:00.000Z',
        }),
      );

    assert.equal(res.status, 201);
    assert.equal(res.body.customer.archived, false, 'archived was accepted from the request body');
    assert.equal(res.body.customer.archivedAt, null);
    assert.notEqual(res.body.customer.id, plantedId, '_id was accepted from the request body');
    assert.notEqual(
      new Date(res.body.customer.createdAt).getUTCFullYear(),
      1999,
      'createdAt was accepted from the request body',
    );
  });

  it('BE-02-01 — creating a customer requires a session', async () => {
    const res = await request(app).post('/api/customers').send(validBody());

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthenticated');
  });
});

// -----------------------------------------------------------------------------------------------
// BE-02-02 — Read one customer
// -----------------------------------------------------------------------------------------------

describe('BE-02-02 — read one customer', () => {
  it('BE-02-02 AC-1 — a dispatcher reading an existing id gets the record', async () => {
    const { cookieHeader } = await asDispatcher();
    const customer = await seedCustomer({ name: 'Readable Ltd' });

    const res = await request(app)
      .get(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body), ['customer']);
    assert.equal(res.body.customer.id, customer._id.toString());
    assert.equal(res.body.customer.name, 'Readable Ltd');
  });

  it('BE-02-02 AC-2 — an id that does not exist returns 404 in the standard envelope', async () => {
    const { cookieHeader } = await asDispatcher();

    const res = await request(app)
      .get(`/api/customers/${new mongoose.Types.ObjectId()}`)
      .set('Cookie', cookieHeader);

    assert.equal(res.status, 404);
    assert.deepEqual(Object.keys(res.body), ['error']);
    assert.equal(res.body.error.code, 'customer_not_found');
    assert.equal(typeof res.body.error.message, 'string');
  });

  it('BE-02-02 AC-2 — an id that is not an ObjectId returns 404 rather than 500', async () => {
    const { cookieHeader } = await asDispatcher();

    const res = await request(app).get('/api/customers/not-an-object-id').set('Cookie', cookieHeader);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'customer_not_found');
  });

  it('BE-02-02 AC-3 — a technician can read a customer attached to a job assigned to them', async () => {
    const { user, cookieHeader } = await asTechnician();
    const customer = await seedCustomer({ name: 'Mine' });
    await seedAssignedTechnician(user, customer);

    const res = await request(app)
      .get(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.equal(res.body.customer.id, customer._id.toString());
  });

  it('BE-02-02 AC-3 — any other id returns 404 for a technician, not 403', async () => {
    const { user, cookieHeader } = await asTechnician();
    const mine = await seedCustomer({ name: 'Mine' });
    const theirs = await seedCustomer({ name: 'Someone Else' });
    await seedAssignedTechnician(user, mine);

    const res = await request(app).get(`/api/customers/${theirs._id}`).set('Cookie', cookieHeader);

    // 404 rather than 403 on purpose: a 403 confirms the id exists, which turns the endpoint into
    // an enumeration oracle for the whole customer list.
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'customer_not_found');
  });

  it('BE-02-02 AC-3 — a technician with no Technician record reaches nothing', async () => {
    const { cookieHeader } = await asTechnician();
    const customer = await seedCustomer();

    const res = await request(app)
      .get(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader);

    assert.equal(res.status, 404);
  });

  it('BE-02-02 AC-4 — a dispatcher can still read an archived customer and the response marks it archived', async () => {
    const { cookieHeader } = await asDispatcher();
    const archivedAt = new Date('2026-08-01T00:00:00.000Z');
    const customer = await seedCustomer({ name: 'Gone Quiet', archived: true, archivedAt });

    const res = await request(app)
      .get(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.equal(res.body.customer.archived, true);
    assert.equal(new Date(res.body.customer.archivedAt).toISOString(), archivedAt.toISOString());
  });
});

// -----------------------------------------------------------------------------------------------
// BE-02-03 — List customers
// -----------------------------------------------------------------------------------------------

describe('BE-02-03 — list customers', () => {
  it('BE-02-03 AC-1 — the list is paginated and reports the enforced maximum page size', async () => {
    const { cookieHeader } = await asDispatcher();
    for (let i = 0; i < 5; i += 1) {
      await seedCustomer({ name: `Customer ${String(i).padStart(2, '0')}` });
    }

    const res = await request(app)
      .get('/api/customers?page=2&pageSize=2')
      .set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['customers', 'page']);
    assert.equal(res.body.customers.length, 2);
    assert.equal(res.body.page.page, 2);
    assert.equal(res.body.page.pageSize, 2);
    assert.equal(res.body.page.total, 5);
    assert.equal(res.body.page.totalPages, 3);
    assert.equal(res.body.page.maxPageSize, 100);
    assert.deepEqual(
      res.body.customers.map((c) => c.name),
      ['Customer 02', 'Customer 03'],
    );
  });

  it('BE-02-03 AC-2 — with no explicit sort the order is deterministic and ties break by _id', async () => {
    const { cookieHeader } = await asDispatcher();
    // Three customers sharing one name: only the _id tiebreak makes paging over them stable.
    const same = [await seedCustomer({ name: 'Tie' }), await seedCustomer({ name: 'Tie' }), await seedCustomer({ name: 'Tie' })];
    const expected = same.map((c) => c._id.toString()).sort();

    const first = await request(app).get('/api/customers?pageSize=2').set('Cookie', cookieHeader);
    const second = await request(app)
      .get('/api/customers?page=2&pageSize=2')
      .set('Cookie', cookieHeader);

    const paged = [...first.body.customers, ...second.body.customers].map((c) => c.id);
    assert.deepEqual(paged, expected, 'paging over equal names did not return each row exactly once');

    // And the same request twice gives the same answer.
    const repeat = await request(app).get('/api/customers?pageSize=2').set('Cookie', cookieHeader);
    assert.deepEqual(repeat.body.customers.map((c) => c.id), first.body.customers.map((c) => c.id));
  });

  it('BE-02-03 AC-3 — archived customers are excluded by default', async () => {
    const { cookieHeader } = await asDispatcher();
    await seedCustomer({ name: 'Active' });
    await seedCustomer({ name: 'Archived', archived: true, archivedAt: new Date() });

    const res = await request(app).get('/api/customers').set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.customers.map((c) => c.name), ['Active']);
    assert.equal(res.body.page.total, 1);
  });

  it('BE-02-03 AC-3 — archived customers are included only with the explicit flag', async () => {
    const { cookieHeader } = await asDispatcher();
    await seedCustomer({ name: 'Active' });
    await seedCustomer({ name: 'Archived', archived: true, archivedAt: new Date() });

    const res = await request(app)
      .get('/api/customers?includeArchived=true')
      .set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.customers.map((c) => c.name), ['Active', 'Archived']);
    assert.equal(res.body.page.total, 2);
  });

  it('BE-02-03 AC-4 — a technician sees only customers reachable through their own assignments', async () => {
    const { user, cookieHeader } = await asTechnician();
    const mine = await seedCustomer({ name: 'Assigned To Me' });
    await seedCustomer({ name: 'Not Mine' });
    await seedCustomer({ name: 'Also Not Mine' });
    await seedAssignedTechnician(user, mine);

    const res = await request(app).get('/api/customers').set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.customers.map((c) => c.name), ['Assigned To Me']);
    assert.equal(res.body.page.total, 1);
  });

  it('BE-02-03 AC-4 — a technician with no assignments gets an empty page, not the full list', async () => {
    const { cookieHeader } = await asTechnician();
    await seedCustomer({ name: 'Not Mine' });

    const res = await request(app).get('/api/customers').set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.customers, []);
    assert.equal(res.body.page.total, 0);
  });

  it('BE-02-03 AC-5 — a page size above the maximum applies the maximum rather than being honoured or rejected', async () => {
    const { cookieHeader } = await asDispatcher();
    await seedCustomer();

    const res = await request(app).get('/api/customers?pageSize=5000').set('Cookie', cookieHeader);

    assert.equal(res.status, 200, 'an over-sized page was rejected instead of clamped');
    assert.equal(res.body.page.pageSize, 100, 'the requested page size was honoured');
  });

  it('BE-02-03 AC-5 — a page size below one is clamped up rather than producing a negative skip', async () => {
    const { cookieHeader } = await asDispatcher();
    await seedCustomer();

    const res = await request(app).get('/api/customers?pageSize=0&page=0').set('Cookie', cookieHeader);

    assert.equal(res.status, 200);
    assert.equal(res.body.page.pageSize, 1);
    assert.equal(res.body.page.page, 1);
  });

  it('BE-02-03 — a non-numeric page size is refused rather than silently ignored', async () => {
    const { cookieHeader } = await asDispatcher();

    const res = await request(app).get('/api/customers?pageSize=lots').set('Cookie', cookieHeader);

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
    assert.match(res.body.error.message, /pageSize/);
  });
});

// -----------------------------------------------------------------------------------------------
// BE-02-04 — Update a customer
// -----------------------------------------------------------------------------------------------

describe('BE-02-04 — update a customer', () => {
  it('BE-02-04 AC-1 — a partial update of whitelisted fields changes only those fields', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer({
      name: 'Before',
      siteAddress: '1 Before Road',
      contactPhone: '+44 000 000000',
    });

    const res = await request(app)
      .patch(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ name: 'After' });

    assert.equal(res.status, 200);
    assert.equal(res.body.customer.name, 'After');
    assert.equal(res.body.customer.siteAddress, '1 Before Road', 'an untouched field changed');
    assert.equal(res.body.customer.contactPhone, '+44 000 000000', 'an untouched field changed');
  });

  it('BE-02-04 AC-1 — the model constraints still apply on update', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer();

    const res = await request(app)
      .patch(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ name: 'x'.repeat(400) });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
  });

  it('BE-02-04 AC-2 — an attempt to set archived through this endpoint is rejected, not dropped', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer();

    const res = await request(app)
      .patch(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ name: 'Renamed', archived: true });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
    assert.match(res.body.error.message, /archived/);

    // The whole request is refused — the rename does not land either.
    const stored = await Customer.findById(customer._id);
    assert.equal(stored.archived, false);
    assert.equal(stored.name, customer.name);
  });

  it('BE-02-04 AC-3 — a technician updating a customer gets 403', async () => {
    const { cookieHeader, csrf } = await asTechnician();
    const customer = await seedCustomer({ name: 'Untouchable' });

    const res = await request(app)
      .patch(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({ name: 'Touched' });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
    const stored = await Customer.findById(customer._id);
    assert.equal(stored.name, 'Untouchable');
  });

  it('BE-02-04 AC-4 — two updates to the same field resolve last-write-wins', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer({ name: 'Original' });

    const patch = (name) =>
      request(app)
        .patch(`/api/customers/${customer._id}`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrf)
        .send({ name });

    await patch('First');
    const second = await patch('Second');

    assert.equal(second.status, 200);
    assert.equal(second.body.customer.name, 'Second');
    const stored = await Customer.findById(customer._id);
    assert.equal(stored.name, 'Second');
  });

  it('BE-02-04 AC-4 — concurrent updates to different fields both survive', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer({ name: 'Original', siteAddress: '1 Original Road' });

    await Promise.all([
      request(app)
        .patch(`/api/customers/${customer._id}`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrf)
        .send({ name: 'Renamed' }),
      request(app)
        .patch(`/api/customers/${customer._id}`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrf)
        .send({ siteAddress: '2 New Road' }),
    ]);

    const stored = await Customer.findById(customer._id);
    assert.equal(stored.name, 'Renamed');
    assert.equal(stored.siteAddress, '2 New Road');
  });

  it('BE-02-04 — an empty body is refused rather than treated as a no-op success', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer();

    const res = await request(app)
      .patch(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_body');
  });

  it('BE-02-04 — updating without the CSRF header is refused', async () => {
    const { cookieHeader } = await asDispatcher();
    const customer = await seedCustomer();

    const res = await request(app)
      .patch(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader)
      .send({ name: 'No CSRF' });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'csrf_failed');
  });
});

// -----------------------------------------------------------------------------------------------
// BE-02-05 — Archive a customer
// -----------------------------------------------------------------------------------------------

describe('BE-02-05 — archive a customer', () => {
  it('BE-02-05 AC-1 — a dispatcher archiving a customer with no open jobs stamps archived and archivedAt, and retains the record', async () => {
    const { user, cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer({ name: 'Winding Down' });
    await Job.create({ customer: customer._id, description: 'Old work', status: 'invoiced' });

    const res = await request(app)
      .post(`/api/customers/${customer._id}/archive`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.customer.archived, true);
    assert.ok(res.body.customer.archivedAt, 'archivedAt was not stamped');

    const stored = await Customer.findById(customer._id);
    assert.ok(stored, 'the record was deleted rather than retained');
    assert.equal(stored.archived, true);
    assert.ok(stored.archivedAt instanceof Date);

    const [entry] = await AuditLog.find({ action: 'customer.archived' });
    assert.ok(entry, 'archiving was not audited');
    assert.equal(entry.actor.toString(), user._id.toString());
    assert.equal(entry.targetId.toString(), customer._id.toString());
    assert.equal(entry.outcome, 'success');
    // BE-01-08 AC-3: no PII on the entry.
    assert.deepEqual(entry.metadata, {});
  });

  it('BE-02-05 AC-2 — a customer with an open job cannot be archived, and the message names how many', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer();
    await Job.create({ customer: customer._id, description: 'Still open', status: 'in_progress' });
    await Job.create({ customer: customer._id, description: 'Also open', status: 'raised' });
    await Job.create({ customer: customer._id, description: 'Done', status: 'completed' });

    const res = await request(app)
      .post(`/api/customers/${customer._id}/archive`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({});

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'customer_has_open_jobs');
    assert.match(res.body.error.message, /2/, 'the message does not name the open job count');

    const stored = await Customer.findById(customer._id);
    assert.equal(stored.archived, false, 'the customer changed despite the refusal');
    assert.equal(stored.archivedAt, null);
    assert.equal(await AuditLog.countDocuments({ action: 'customer.archived' }), 0);
  });

  it('BE-02-05 AC-2 — completed, invoiced and cancelled jobs do not block archiving', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer();
    await Job.create({ customer: customer._id, description: 'Done', status: 'completed' });
    await Job.create({ customer: customer._id, description: 'Billed', status: 'invoiced' });
    await Job.create({
      customer: customer._id,
      description: 'Called off',
      status: 'cancelled',
      cancelledReason: 'Customer no longer needs it',
    });

    const res = await request(app)
      .post(`/api/customers/${customer._id}/archive`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.customer.archived, true);
  });

  it('BE-02-05 AC-3 — an archived customer is out of the default list but still resolves on an existing record', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer({ name: 'Archived Away' });

    await request(app)
      .post(`/api/customers/${customer._id}/archive`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({});

    const list = await request(app).get('/api/customers').set('Cookie', cookieHeader);
    assert.deepEqual(list.body.customers, [], 'an archived customer appeared in the default list');

    const read = await request(app)
      .get(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader);
    assert.equal(read.status, 200, 'an archived customer stopped resolving');
    assert.equal(read.body.customer.archived, true);
  });

  it('BE-02-05 AC-4 — archiving an already-archived customer returns 200 and leaves the state unchanged', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer();

    const archive = () =>
      request(app)
        .post(`/api/customers/${customer._id}/archive`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrf)
        .send({});

    const first = await archive();
    const second = await archive();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.customer.archived, true);
    assert.equal(
      second.body.customer.archivedAt,
      first.body.customer.archivedAt,
      'the repeat re-stamped archivedAt instead of leaving the state unchanged',
    );
  });

  it('BE-02-05 AC-4 — a job raised after archiving does not make the idempotent repeat fail', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer();

    const archive = () =>
      request(app)
        .post(`/api/customers/${customer._id}/archive`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrf)
        .send({});

    await archive();
    await Job.create({ customer: customer._id, description: 'Slipped in', status: 'raised' });

    const second = await archive();
    assert.equal(second.status, 200, 'the idempotent repeat 409d on a job raised after archiving');
    assert.equal(second.body.customer.archived, true);
  });

  it('BE-02-05 AC-3 — a technician cannot archive a customer, even one of their own', async () => {
    const { user, cookieHeader, csrf } = await asTechnician();
    const customer = await seedCustomer();
    await seedAssignedTechnician(user, customer, { status: 'completed' });

    const res = await request(app)
      .post(`/api/customers/${customer._id}/archive`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({});

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  it('BE-02-05 AC-5 — no hard-delete endpoint exists', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const customer = await seedCustomer();

    const res = await request(app)
      .delete(`/api/customers/${customer._id}`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
    assert.ok(await Customer.findById(customer._id), 'the customer was deleted');
  });

  it('BE-02-05 — archiving a customer that does not exist returns 404', async () => {
    const { cookieHeader, csrf } = await asDispatcher();

    const res = await request(app)
      .post(`/api/customers/${new mongoose.Types.ObjectId()}/archive`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send({});

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'customer_not_found');
  });
});

// -----------------------------------------------------------------------------------------------
// The epic's own boundary: customers are records, not accounts.
// -----------------------------------------------------------------------------------------------

describe('BE-02 — customers are records, not accounts', () => {
  it('BE-02 — creating a customer creates no credential of any kind', async () => {
    const { cookieHeader, csrf } = await asDispatcher();
    const { User } = await import('../src/models/User.js');
    const before = await User.countDocuments({});

    const res = await request(app)
      .post('/api/customers')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrf)
      .send(validBody({ contactEmail: uniqueEmail('customer-contact') }));

    assert.equal(res.status, 201);
    assert.equal(await User.countDocuments({}), before, 'a user account was created for a customer');
    // Nothing password-shaped is accepted or returned either.
    assert.equal(res.body.customer.passwordHash, undefined);
  });
});
