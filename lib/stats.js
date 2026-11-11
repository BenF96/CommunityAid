const Resource = require('../models/Resource');
const AidRequest = require('../models/AidRequest');

const OPEN = { status: { $ne: 'fulfilled' } };

// Counts shown as badges in the sidebar (runs on every page view)
async function navCounts() {
  const [byStatus, urgentOpen, byCat] = await Promise.all([
    AidRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    AidRequest.countDocuments({ ...OPEN, urgency: 3 }),
    Resource.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]),
  ]);
  const s = Object.fromEntries(byStatus.map((x) => [x._id, x.n]));
  const c = Object.fromEntries(byCat.map((x) => [x._id, x.n]));
  return {
    pending: s.pending || 0,
    inProgress: s['in-progress'] || 0,
    fulfilled: s.fulfilled || 0,
    requests: (s.pending || 0) + (s['in-progress'] || 0) + (s.fulfilled || 0),
    urgentOpen,
    food: c.food || 0,
    financial: c.financial || 0,
    resources: (c.food || 0) + (c.financial || 0),
  };
}

const EMPTY_NAV = {
  pending: 0, inProgress: 0, fulfilled: 0, requests: 0, urgentOpen: 0, food: 0, financial: 0, resources: 0,
};

// Everything the dashboard needs, in as few round trips as possible
async function dashboard(days = 14) {
  const today = new Date();
  const since = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1)));
  const isOpen = { $ne: ['$status', 'fulfilled'] };

  const [[f], resourceGroups, needsAttention] = await Promise.all([
    AidRequest.aggregate([
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
          byType: [{
            $group: {
              _id: '$aidType',
              total: { $sum: 1 },
              open: { $sum: { $cond: [isOpen, 1, 0] } },
              fulfilled: { $sum: { $cond: [isOpen, 0, 1] } },
            },
          }],
          openByUrgency: [{ $match: OPEN }, { $group: { _id: '$urgency', n: { $sum: 1 } } }],
          totals: [{
            $group: {
              _id: { $cond: [isOpen, 'open', 'fulfilled'] },
              people: { $sum: { $ifNull: ['$householdSize', 1] } },
              amount: { $sum: { $ifNull: ['$amountNeeded', 0] } },
            },
          }],
          fulfilTime: [
            { $match: { status: 'fulfilled', fulfilledAt: { $ne: null } } },
            { $group: { _id: null, avgMs: { $avg: { $subtract: ['$fulfilledAt', '$createdAt'] } } } },
          ],
          daily: [
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
          ],
          topResources: [
            { $match: { assignedResource: { $ne: null } } },
            {
              $group: {
                _id: '$assignedResource',
                total: { $sum: 1 },
                open: { $sum: { $cond: [isOpen, 1, 0] } },
              },
            },
            { $sort: { total: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'resources', localField: '_id', foreignField: '_id', as: 'resource' } },
            { $unwind: '$resource' },
          ],
          activity: [
            { $unwind: '$history' },
            { $sort: { 'history.at': -1 } },
            { $limit: 8 },
            { $project: { fullName: 1, ref: 1, history: 1 } },
          ],
        },
      },
    ]),
    Resource.aggregate([{ $group: { _id: { category: '$category', active: '$isActive' }, n: { $sum: 1 } } }]),
    AidRequest.find(OPEN).sort({ urgency: -1, createdAt: 1 }).limit(6).populate('assignedResource', 'name'),
  ]);

  const byStatus = Object.fromEntries(f.byStatus.map((x) => [x._id, x.n]));
  const status = {
    pending: byStatus.pending || 0,
    inProgress: byStatus['in-progress'] || 0,
    fulfilled: byStatus.fulfilled || 0,
  };
  status.total = status.pending + status.inProgress + status.fulfilled;
  status.open = status.pending + status.inProgress;

  const blankType = { total: 0, open: 0, fulfilled: 0 };
  const byType = {
    food: { ...blankType, ...(f.byType.find((x) => x._id === 'food') || {}) },
    financial: { ...blankType, ...(f.byType.find((x) => x._id === 'financial') || {}) },
  };

  const urg = Object.fromEntries(f.openByUrgency.map((x) => [x._id, x.n]));
  const urgency = { high: urg[3] || 0, medium: urg[2] || 0, low: urg[1] || 0 };

  const totalsOpen = f.totals.find((x) => x._id === 'open') || { people: 0, amount: 0 };
  const totalsDone = f.totals.find((x) => x._id === 'fulfilled') || { people: 0, amount: 0 };

  const dailyMap = Object.fromEntries(f.daily.map((x) => [x._id, x.n]));
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    daily.push({ key, date: d, n: dailyMap[key] || 0 });
  }

  const resources = { food: 0, financial: 0, active: 0, inactive: 0 };
  resourceGroups.forEach((g) => {
    resources[g._id.category] = (resources[g._id.category] || 0) + g.n;
    resources[g._id.active === false ? 'inactive' : 'active'] += g.n;
  });

  const avgMs = f.fulfilTime[0] && f.fulfilTime[0].avgMs;

  return {
    status,
    byType,
    urgency,
    people: { waiting: totalsOpen.people, helped: totalsDone.people },
    amount: { open: totalsOpen.amount, fulfilled: totalsDone.amount },
    avgDaysToFulfil: avgMs != null ? avgMs / 86400000 : null,
    daily,
    dailyMax: Math.max(1, ...daily.map((d) => d.n)),
    dailyTotal: daily.reduce((a, d) => a + d.n, 0),
    topResources: f.topResources,
    activity: f.activity,
    resources,
    needsAttention,
  };
}

module.exports = { navCounts, dashboard, EMPTY_NAV };
