// End-to-end tests against a throwaway in-memory MongoDB: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongo;
let server;
let base;

before(async () => {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri() + 'aid_test';
  const { start } = require('../app');
  server = await start(uri, 0);
  base = `http://localhost:${server.address().port}`;
  await require('./fixtures')();
});

after(async () => {
  server && server.close();
  await mongoose.disconnect();
  mongo && (await mongo.stop());
});

const get = (p) => fetch(base + p, { redirect: 'manual' });
const post = (p, body) =>
  fetch(base + p, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
const html = async (p) => (await get(p)).text();

test('all main pages render', async () => {
  for (const p of [
    '/', '/resources', '/resources?category=food&q=bank&sort=newest', '/resources?state=inactive',
    '/requests', '/requests?status=open&urgency=3', '/requests?sort=name&page=2', '/requests?q=a&q=b',
    '/resources/new', '/requests/new', '/requests/new?aidType=financial',
  ]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
  }
});

test('layout has sidebar, hamburger and security headers', async () => {
  const r = await get('/');
  const body = await r.text();
  assert.match(body, /id="sidebar"/);
  assert.match(body, /data-action="toggle-sidebar"/);
  assert.match(body, /aria-current="page"/);
  assert.ok(r.headers.get('content-security-policy'));
  assert.ok(!/<script>(?!\s*<\/script>)/.test(body), 'no inline scripts');
});

test('dashboard shows seeded statistics', async () => {
  const body = await html('/');
  assert.match(body, /Open requests/);
  assert.match(body, /<time data-live-date="long" datetime="[^"]+">[^<]+<\/time>/);
  assert.match(body, /James Carter/);
  assert.match(body, /₱1,945\.00/); // open financial requests: 650 + 1200 + 95
  assert.match(body, /₱580\.00/); // fulfilled financial requests: 180 + 400
  assert.ok(!/\$\d/.test(body), 'no dollar amounts');
});

test('sidebar highlights the link for the current page', async () => {
  const active = async (p) => {
    const m = (await html(p)).match(/<a href="([^"]+)" class="nav-link active"/g) || [];
    return m.map((s) => s.match(/href="([^"]+)"/)[1]);
  };
  assert.deepEqual(await active('/'), ['/']);
  assert.deepEqual(await active('/requests'), ['/requests']);
  assert.deepEqual(await active('/requests?status=pending'), ['/requests?status=pending']);
  assert.deepEqual(await active('/resources?category=food'), ['/resources?category=food']);
  assert.deepEqual(await active('/resources/new'), ['/resources/new']);
});

test('sidebar collapsed state is rendered from cookie', async () => {
  const r = await fetch(base + '/', { headers: { cookie: 'sidebar=collapsed' } });
  assert.match(await r.text(), /<body class="sidebar-collapsed">/);
  // icon rail is the default; an "expanded" cookie opens the full sidebar
  assert.match(await html('/'), /<body class="sidebar-collapsed">/);
  const e = await fetch(base + '/', { headers: { cookie: 'sidebar=expanded' } });
  assert.match(await e.text(), /<body class="">/);
});

test('resource CRUD with flash messages and validation', async () => {
  let r = await post('/resources', { name: 'Test Pantry', category: 'food', isActive: 'on', website: 'https://x.org' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('set-cookie'), /flash=/);
  const loc = r.headers.get('location');
  assert.match(await html(loc), /Test Pantry/);

  r = await post(loc + '?_method=PUT', { name: 'Renamed Pantry', category: 'financial' });
  assert.equal(r.status, 302);
  const body = await html(loc);
  assert.match(body, /Renamed Pantry/);
  assert.match(body, /Inactive/);

  r = await post('/resources', { name: '', category: 'food', website: 'notaurl', email: 'bad' });
  assert.equal(r.status, 400);
  const err = await r.text();
  assert.match(err, /Name is required/);
  assert.match(err, /Website must start with http/);
  assert.match(err, /valid email/);
});

test('request lifecycle: create, assign, status, history, delete', async () => {
  let r = await post('/requests', { fullName: 'No Contact', aidType: 'food', description: 'x' });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /phone number or an email/);

  // admin intake: status defaults to pending
  r = await post('/requests', {
    fullName: 'Test Person', phone: '555 000', aidType: 'financial', amountNeeded: '120.5',
    householdSize: '2', urgency: '3', description: 'Need help with rent',
  });
  assert.equal(r.status, 302);
  const loc = r.headers.get('location');
  let body = await html(loc);
  assert.match(body, /₱120\.50/);
  assert.match(body, /CA-[0-9A-F]{6}/);
  assert.match(body, /s-pending/);
  assert.match(body, /Request logged for financial aid/);

  const res = await post('/resources', { name: 'Assign Target', category: 'financial', isActive: 'on' });
  const resId = res.headers.get('location').split('/').pop();

  r = await post(loc + '?_method=PUT', {
    fullName: 'Test Person', phone: '555 000', aidType: 'financial', amountNeeded: '200', householdSize: '2',
    urgency: '2', description: 'Need help', status: 'in-progress', assignedResource: resId, notes: 'Called back',
  });
  assert.equal(r.status, 302);
  body = await html(loc);
  assert.match(body, /Assign Target/);
  assert.match(body, /Called back/);
  assert.match(body, /Status changed from Pending to In progress/);
  assert.match(body, /Assigned to Assign Target/);

  r = await post(loc + '/status?_method=PATCH', { status: 'fulfilled' });
  assert.equal(r.status, 302);
  body = await html(loc);
  assert.match(body, /s-fulfilled/);
  assert.match(body, /In progress to Fulfilled/);

  // deleting the resource unassigns the request and logs it
  r = await post(`/resources/${resId}?_method=DELETE`, {});
  assert.equal(r.status, 302);
  body = await html(loc);
  assert.match(body, /was deleted; request unassigned/);
  assert.match(body, /Not assigned to a resource yet/);

  r = await post(loc + '?_method=DELETE', {});
  assert.equal(r.status, 302);
  assert.equal((await get(loc)).status, 404);
});

test('admin can set case handling when creating a request', async () => {
  const res = await post('/resources', { name: 'Intake Pantry', category: 'food', isActive: 'on' });
  const resId = res.headers.get('location').split('/').pop();
  assert.match(await html(`/requests/new?aidType=food&resource=${resId}`), new RegExp(`value="${resId}" selected`));

  const r = await post('/requests', {
    fullName: 'Walk In', phone: '555 111', aidType: 'food', description: 'Needs groceries',
    status: 'in-progress', assignedResource: resId, notes: 'Walk-in at front desk',
  });
  assert.equal(r.status, 302);
  const body = await html(r.headers.get('location'));
  assert.match(body, /s-in-progress/);
  assert.match(body, /Intake Pantry/);
  assert.match(body, /Walk-in at front desk/);
  assert.match(body, /Request logged for food aid/);
  assert.match(body, /Assigned to Intake Pantry/);
});

test('CSV export respects filters and escapes values', async () => {
  await post('/requests', {
    fullName: '=HYPERLINK("x")', phone: '555', aidType: 'food', description: 'has, comma "and quotes"',
  });
  const r = await get('/requests/export.csv?aidType=food');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  const csv = await r.text();
  assert.match(csv, /^﻿?Reference,Full name/);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"has, comma ""and quotes"""/);
  assert.ok(!/,financial,/.test(csv));
});

test('pagination splits long lists', async () => {
  const body = await html('/requests');
  assert.match(body, /Showing <strong>1–10<\/strong>/);
  assert.match(body, /class="pagination"/);
});

test('not found and invalid ids return 404', async () => {
  assert.equal((await get('/requests/notanid')).status, 404);
  assert.equal((await get('/resources/000000000000000000000000')).status, 404);
  assert.equal((await get('/nope')).status, 404);
  assert.equal((await post('/requests/notanid?_method=DELETE', {})).status, 404);
});

test('health check reports database status', async () => {
  const r = await get('/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'ok' });
});
