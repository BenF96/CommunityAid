const express = require('express');
const mongoose = require('mongoose');
const Resource = require('../models/Resource');
const AidRequest = require('../models/AidRequest');
const { validationMessages, escapeRegex, str, paginate } = require('./helpers');

const router = express.Router();

const SORTS = {
  name: { isActive: -1, name: 1 },
  newest: { createdAt: -1 },
  updated: { updatedAt: -1 },
};

// Only accept known fields from the form
function pickResource(body) {
  return {
    name: body.name,
    category: body.category,
    type: body.type,
    description: body.description,
    address: body.address,
    serviceArea: body.serviceArea,
    phone: body.phone || undefined,
    email: body.email || undefined,
    website: body.website || undefined,
    hours: body.hours,
    eligibility: body.eligibility,
    isActive: body.isActive === 'on' || body.isActive === 'true' || body.isActive === true,
  };
}

function renderForm(res, status, opts) {
  res.status(status).render('resources/form', { errors: null, ...opts });
}

// READ - list with search, filters, sort and pagination
router.get('/', async (req, res, next) => {
  try {
    const q = str(req.query.q);
    const category = str(req.query.category);
    const state = str(req.query.state);
    const sort = SORTS[str(req.query.sort)] ? str(req.query.sort) : 'name';

    const filter = {};
    if (['food', 'financial'].includes(category)) filter.category = category;
    if (state === 'active') filter.isActive = true;
    if (state === 'inactive') filter.isActive = false;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { type: rx }, { description: rx }, { address: rx }, { serviceArea: rx }];
    }

    const total = await Resource.countDocuments(filter);
    const pg = paginate(req, total);
    const resources = await Resource.find(filter).sort(SORTS[sort]).skip(pg.skip).limit(pg.limit);

    // How many open / total requests are assigned to each resource on this page
    const usage = await AidRequest.aggregate([
      { $match: { assignedResource: { $in: resources.map((r) => r._id) } } },
      {
        $group: {
          _id: '$assignedResource',
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $ne: ['$status', 'fulfilled'] }, 1, 0] } },
        },
      },
    ]);
    const usageById = Object.fromEntries(usage.map((u) => [String(u._id), u]));

    res.render('resources/index', {
      title: 'Resources', resources, usageById, q, category, state, sort, pg,
    });
  } catch (err) {
    next(err);
  }
});

// CREATE - form
router.get('/new', (req, res) => {
  renderForm(res, 200, {
    title: 'Add Resource',
    resource: { isActive: true, category: str(req.query.category) === 'financial' ? 'financial' : 'food' },
    action: '/resources',
  });
});

// CREATE - save
router.post('/', async (req, res, next) => {
  const data = pickResource(req.body);
  try {
    const resource = await Resource.create(data);
    req.flash('success', `Resource "${resource.name}" was added.`);
    res.redirect(`/resources/${resource._id}`);
  } catch (err) {
    const errors = validationMessages(err);
    if (!errors) return next(err);
    renderForm(res, 400, { title: 'Add Resource', resource: data, errors, action: '/resources' });
  }
});

// READ - single, with the requests assigned to it
router.get('/:id', async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return next();
    const assigned = await AidRequest.find({ assignedResource: resource._id })
      .sort({ status: 1, urgency: -1, createdAt: -1 })
      .limit(50);
    const summary = {
      total: assigned.length,
      open: assigned.filter((r) => r.status !== 'fulfilled').length,
      fulfilled: assigned.filter((r) => r.status === 'fulfilled').length,
      people: assigned.filter((r) => r.status === 'fulfilled').reduce((a, r) => a + (r.householdSize || 1), 0),
    };
    res.render('resources/show', { title: resource.name, resource, assigned, summary });
  } catch (err) {
    next(err);
  }
});

// UPDATE - form
router.get('/:id/edit', async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return next();
    renderForm(res, 200, {
      title: 'Edit Resource', resource, action: `/resources/${resource._id}?_method=PUT`,
    });
  } catch (err) {
    next(err);
  }
});

// UPDATE - save
router.put('/:id', async (req, res, next) => {
  const data = pickResource(req.body);
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return next();
    // Clear optional fields that were emptied in the form
    ['phone', 'email', 'website'].forEach((k) => {
      if (data[k] === undefined) resource[k] = undefined;
    });
    resource.set(data);
    await resource.save();
    req.flash('success', 'Resource updated.');
    res.redirect(`/resources/${resource._id}`);
  } catch (err) {
    const errors = validationMessages(err);
    if (!errors) return next(err);
    renderForm(res, 400, {
      title: 'Edit Resource', resource: { ...data, _id: req.params.id }, errors,
      action: `/resources/${req.params.id}?_method=PUT`,
    });
  }
});

// DELETE - also unassigns any requests that pointed at this resource
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return next();
    const resource = await Resource.findByIdAndDelete(req.params.id);
    if (!resource) return next();
    const { modifiedCount } = await AidRequest.updateMany(
      { assignedResource: resource._id },
      {
        $unset: { assignedResource: 1 },
        $push: {
          history: { at: new Date(), action: 'assigned', detail: `Resource "${resource.name}" was deleted; request unassigned` },
        },
      }
    );
    req.flash(
      'success',
      `Resource "${resource.name}" was deleted.` +
        (modifiedCount ? ` ${modifiedCount} request(s) were unassigned.` : '')
    );
    res.redirect('/resources');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
