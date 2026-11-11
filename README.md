# Community Aid Hub

An admin console for managing community **food** and **financial** aid requests and resources,
built with **Node.js**, **Express 5**, **MongoDB** (Mongoose) and server-rendered EJS templates.

## Features

**Layout**
- Sidebar navigation with live count badges. The hamburger button collapses it to an icon rail on
  desktop (remembered between visits) and opens it as a slide-in drawer on phones (closes with Esc,
  the backdrop or the × button).
- Black / cyan / magenta theme with layered depth, responsive tables that become cards on phones,
  print-friendly request pages, a skip link and keyboard focus styles.

**Dashboard**
- KPIs: open requests, urgent & open, people waiting, people helped, financial aid requested and
  fulfilled, average time to fulfil, active resources.
- Request pipeline, open requests by urgency, requests by type, new requests over the last 14 days,
  a "needs attention" list (most urgent and longest-waiting), recent activity and most-used resources.

**Aid requests** (full CRUD)
- Admin intake form for requests taken by phone, walk-in or referral, with status, assigned
  resource and case notes set on creation. Each request gets a short reference number (e.g. `CA-3F9A1C`).
- Status tabs, search (name, reference, phone, email, need), filters (type, urgency), sorting and pagination.
- Detail page with a progress stepper, one-click status changes, assigned resource, case notes,
  suggested resources and a full **timeline** of every change.
- CSV export of the current filtered list.

**Resources** (full CRUD)
- Category tabs, search, active/inactive filter, sorting and pagination.
- Detail page with contact info, eligibility, impact numbers and all assigned requests.
- Deleting a resource automatically unassigns its requests and logs it on their timelines.

**Safety & quality**
- Security headers and a strict Content Security Policy (helmet; no inline scripts).
- Server-side validation (required fields, email, phone and website formats, at least one contact method).
- CSV export guards against spreadsheet formula injection.
- Database indexes, `/healthz` endpoint, graceful shutdown, automated tests.

## Setup

Requirements: Node.js 18.18+ and MongoDB (local or Atlas).

```bash
npm install
cp .env.example .env      # set MONGODB_URI (and PORT if 3000 is taken)
npm start                 # http://localhost:3000
```

The app starts empty. Add your resources from the sidebar (**Resources → Add resource**).

`npm run dev` restarts on file changes. `npm test` runs the test suite against a temporary
in-memory MongoDB (downloaded automatically on first run); its sample data lives in
`test/fixtures.js` and never touches your real database.

> **Atlas passwords:** URL-encode special characters in the connection string (`@` → `%40`, `:` → `%3A`, `/` → `%2F`).

## Routes

| Method | Path | Action |
| --- | --- | --- |
| GET | `/` | Dashboard |
| GET | `/resources` | List (`q`, `category`, `state=active\|inactive`, `sort`, `page`) |
| GET / POST | `/resources/new`, `/resources` | Create |
| GET | `/resources/:id` | Detail |
| GET / PUT | `/resources/:id/edit`, `/resources/:id` | Update |
| DELETE | `/resources/:id` | Delete (unassigns linked requests) |
| GET | `/requests` | List (`q`, `status=pending\|in-progress\|fulfilled\|open`, `aidType`, `urgency`, `sort`, `page`) |
| GET | `/requests/export.csv` | CSV export (same filters) |
| GET / POST | `/requests/new`, `/requests` | Create |
| GET | `/requests/:id` | Detail + timeline |
| GET / PUT | `/requests/:id/edit`, `/requests/:id` | Update (status, assignment, notes) |
| PATCH | `/requests/:id/status` | Quick status change |
| DELETE | `/requests/:id` | Delete |
| GET | `/healthz` | Health check (JSON) |

HTML forms send PUT / PATCH / DELETE through `method-override` (`?_method=PUT`).

## Project structure

```
app.js            Express setup, security, layout data, dashboard, errors, startup/shutdown
models/           Resource, AidRequest (reference number, history, fulfilledAt)
routes/           resources.js, requests.js, helpers.js (pagination, CSV, validation)
lib/              stats.js (dashboard/sidebar queries), format.js, icons.js
views/            EJS templates: partials (layout, sidebar, pagination), resources/, requests/
public/           css/style.css, js/app.js (sidebar, confirmations, form behaviour)
test/             End-to-end tests (node:test + mongodb-memory-server) and test-only sample data
```

## Not yet implemented

- **Admin login.** The app is admin-only, but there is no sign-in yet: anyone who can reach the
  server can view and edit requests, including requesters' contact details. Before real use, add
  admin accounts (e.g. `express-session` + `connect-mongo` + `bcrypt`) and require sign-in on every route.
- **CSRF protection.** Add it together with login (e.g. `csrf-sync`).
- **Notifications.** Email or SMS to the requester when their status changes.
