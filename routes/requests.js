const express = require('express');
const mongoose = require('mongoose');
const AidRequest = require('../models/AidRequest');
const Resource = require('../models/Resource');
const { statusLabel } = require('../lib/format');
const { validationMessages, escapeRegex, str, paginate, csvCell } = require('./helpers');

const router = express.Router();
const STATUSES = AidRequest.STATUSES;

const SORTS = {
  urgency: { urgency: -1, createdAt: 1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  updated: { updatedAt: -1 },
  name: { fullName: 1 },
};

const toNumber = (v) => (v === undefined || v === '' ? undefined : Number(v));

// Only accept known fields from the form (admin forms include case handling)
function pickRequest(body, { staff = true } = {}) {
  const data = {
    fullName: body.fullName,
    phone: body.phone || undefined,
    email: body.email || undefined,
    aidType: body.aidType,
    householdSize: toNumber(body.householdSize),
    amountNeeded: body.aidType === 'financial' ? toNumber(body.amountNeeded) : undefined,
    description: body.description,
    urgency: toNumber(body.urgency),
  };
  if (staff) {
    data.status = STATUSES.includes(body.status) ? body.status : 'pending';
    data.assignedResource = mongoose.isValidObjectId(body.assignedResource) ? body.assignedResource : null;
    data.notes = body.notes;
  }
  return data;
}

// Shared filter for the list page and the CSV export
function buildFilter(query) {
  const q = str(query.q);
  const aidType = str(query.aidType);
  const status = str(query.status);
  const urgency = str(query.urgency);
  const filter = {};
  if (['food', 'financial'].includes(aidType)) filter.aidType = aidType;
  if (STATUSES.includes(status)) filter.status = status;
  if (status === 'open') filter.status = { $ne: 'fulfilled' };
  if (['1', '2', '3'].includes(urgency)) filter.urgency = Number(urgency);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ fullName: rx }, { description: rx }, { email: rx }, { phone: rx }, { ref: rx }];
  }
  return { filter, q, aidType, status, urgency };
}

// Render the shared new/edit form (it needs active resources for assignment + suggestions)
async function renderForm(res, status, opts) {
  const resources = await Resource.find({ isActive: true }).sort({ name: 1 });
  res.status(status).render('requests/form', { resources, errors: null, ...opts });
}

// READ - list with filters, sort and pagination
router.get('/', async (req, res, next) => {
  try {
    const { filter, ...filters } = buildFilter(req.query);
    const sort = SORTS[str(req.query.sort)] ? str(req.query.sort) : 'urgency';
    const total = await AidRequest.countDocuments(filter);
    const pg = paginate(req, total);
    const requests = await AidRequest.find(filter)
      .populate('assignedResource', 'name')
      .sort(SORTS[sort])
      .skip(pg.skip)
      .limit(pg.limit);
    const exportQuery = new URLSearchParams(
      Object.entries({ ...filters, sort }).filter(([, v]) => v)
    ).toString();
    res.render('requests/index', { title: 'Aid Requests', requests, ...filters, sort, pg, exportQuery });
  } catch (err) {
    next(err);
  }
});

// EXPORT - CSV of the current filtered list
router.get('/export.csv', async (req, res, next) => {
  try {
    const { filter } = buildFilter(req.query);
    const sort = SORTS[str(req.query.sort)] || SORTS.urgency;
    const rows = await AidRequest.find(filter).populate('assignedResource', 'name').sort(sort).limit(10000);
    const header = [
      'Reference', 'Full name', 'Phone', 'Email', 'Aid type', 'Household size', 'Amount needed (PHP)',
      'Urgency', 'Status', 'Assigned resource', 'Description', 'Notes', 'Submitted', 'Updated', 'Fulfilled',
    ];
    const lines = rows.map((r) =>
      [
        r.refCode, r.fullName, r.phone, r.email, r.aidType, r.householdSize, r.amountNeeded,
        r.urgencyLabel, statusLabel(r.status), r.assignedResource && r.assignedResource.name,
        r.description, r.notes, r.createdAt && r.createdAt.toISOString(),
        r.updatedAt && r.updatedAt.toISOString(), r.fulfilledAt && r.fulfilledAt.toISOString(),
      ].map(csvCell).join(',')
    );
    res.type('text/csv');
    res.attachment(`aid-requests-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('﻿' + [header.join(','), ...lines].join('\r\n'));
  } catch (err) {
    next(err);
  }
});

// CREATE - form
router.get('/new', async (req, res, next) => {
  try {
    const assignedResource = mongoose.isValidObjectId(req.query.resource) ? req.query.resource : null;
    await renderForm(res, 200, {
      title: 'New Request',
      aidRequest: {
        aidType: str(req.query.aidType) === 'financial' ? 'financial' : 'food',
        urgency: 2, householdSize: 1, status: 'pending', assignedResource,
      },
      action: '/requests',
    });
  } catch (err) {
    next(err);
  }
});

// CREATE - save (admin intake: status, assignment and notes can be set straight away)
router.post('/', async (req, res, next) => {
  const data = pickRequest(req.body);
  try {
    const aidRequest = new AidRequest(data);
    if (aidRequest.assignedResource) {
      const r = await Resource.findById(aidRequest.assignedResource).select('name');
      if (r) aidRequest.history.push({ action: 'assigned', detail: `Assigned to ${r.name}` });
      else aidRequest.assignedResource = null;
    }
    await aidRequest.save();
    req.flash('success', `Request ${aidRequest.refCode} logged for ${aidRequest.fullName}.`);
    res.redirect(`/requests/${aidRequest._id}`);
  } catch (err) {
    const errors = validationMessages(err);
    if (!errors) return next(err);
    renderForm(res, 400, {
      title: 'New Request', aidRequest: data, errors, action: '/requests',
    }).catch(next);
  }
});

// READ - single
router.get('/:id', async (req, res, next) => {
  try {
    const aidRequest = await AidRequest.findById(req.params.id).populate('assignedResource');
    if (!aidRequest) return next();
    const suggestions = aidRequest.assignedResource
      ? []
      : await Resource.find({ category: aidRequest.aidType, isActive: true }).sort({ name: 1 }).limit(4);
    res.render('requests/show', {
      title: `${aidRequest.refCode} · ${aidRequest.fullName}`, aidRequest, suggestions,
    });
  } catch (err) {
    next(err);
  }
});

// UPDATE - form
router.get('/:id/edit', async (req, res, next) => {
  try {
    const aidRequest = await AidRequest.findById(req.params.id);
    if (!aidRequest) return next();
    await renderForm(res, 200, {
      title: `Edit ${aidRequest.refCode}`, aidRequest,
      action: `/requests/${aidRequest._id}?_method=PUT`,
    });
  } catch (err) {
    next(err);
  }
});

// Record what changed in the request's history
async function recordChanges(doc, before) {
  if (doc.status !== before.status) {
    doc.history.push({
      action: 'status', detail: `Status changed from ${statusLabel(before.status)} to ${statusLabel(doc.status)}`,
    });
  }
  const nowAssigned = doc.assignedResource ? String(doc.assignedResource) : '';
  if (nowAssigned !== before.assigned) {
    const r = nowAssigned ? await Resource.findById(nowAssigned).select('name') : null;
    doc.history.push({ action: 'assigned', detail: r ? `Assigned to ${r.name}` : 'Unassigned from resource' });
  }
  if ((doc.notes || '') !== before.notes) doc.history.push({ action: 'note', detail: 'Case notes updated' });
  const edited = ['fullName', 'phone', 'email', 'aidType', 'householdSize', 'amountNeeded', 'description', 'urgency']
    .filter((k) => doc.isModified(k));
  if (edited.length) doc.history.push({ action: 'updated', detail: `Edited: ${edited.join(', ')}` });
}

// UPDATE - save (uses save() so validation, hooks and history all run)
router.put('/:id', async (req, res, next) => {
  const data = pickRequest(req.body);
  try {
    const aidRequest = await AidRequest.findById(req.params.id);
    if (!aidRequest) return next();
    const before = {
      status: aidRequest.status,
      assigned: aidRequest.assignedResource ? String(aidRequest.assignedResource) : '',
      notes: aidRequest.notes || '',
    };
    ['phone', 'email', 'amountNeeded'].forEach((k) => {
      if (data[k] === undefined) aidRequest[k] = undefined;
    });
    aidRequest.set(data);
    await recordChanges(aidRequest, before);
    await aidRequest.save();
    req.flash('success', 'Request updated.');
    res.redirect(`/requests/${aidRequest._id}`);
  } catch (err) {
    const errors = validationMessages(err);
    if (!errors) return next(err);
    renderForm(res, 400, {
      title: 'Edit Request', aidRequest: { ...data, _id: req.params.id }, errors,
      action: `/requests/${req.params.id}?_method=PUT`,
    }).catch(next);
  }
});

// UPDATE - quick status change
router.patch('/:id/status', async (req, res, next) => {
  try {
    const aidRequest = await AidRequest.findById(req.params.id);
    if (!aidRequest) return next();
    const { status } = req.body;
    if (STATUSES.includes(status) && status !== aidRequest.status) {
      const before = {
        status: aidRequest.status,
        assigned: aidRequest.assignedResource ? String(aidRequest.assignedResource) : '',
        notes: aidRequest.notes || '',
      };
      aidRequest.status = status;
      await recordChanges(aidRequest, before);
      await aidRequest.save();
      req.flash('success', `Status changed to ${statusLabel(status)}.`);
    }
    res.redirect(`/requests/${aidRequest._id}`);
  } catch (err) {
    next(err);
  }
});

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return next();
    const aidRequest = await AidRequest.findByIdAndDelete(req.params.id);
    if (!aidRequest) return next();
    req.flash('success', `Request ${aidRequest.refCode} (${aidRequest.fullName}) was deleted.`);
    res.redirect('/requests');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
