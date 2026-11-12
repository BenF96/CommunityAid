require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const format = require('./lib/format');
const icon = require('./lib/icons');
const stats = require('./lib/stats');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/community_aid';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

// Template helpers
// assetVersion changes on every restart so browsers fetch fresh CSS/JS
Object.assign(app.locals, format, { icon, assetVersion: Date.now().toString(36) });

// Security headers. All scripts live in /public/js, so inline scripts stay blocked.
app.use(
  helmet({
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  })
);

app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(methodOverride('_method')); // lets HTML forms send PUT / PATCH / DELETE
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Health check for uptime monitors / hosting platforms
app.get('/healthz', (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'db-unavailable' });
});

// Flash messages: a one-time message stored in a short-lived cookie
app.use((req, res, next) => {
  res.locals.flash = null;
  if (req.cookies.flash) {
    try {
      res.locals.flash = JSON.parse(req.cookies.flash);
    } catch {
      /* ignore malformed cookie */
    }
    res.clearCookie('flash');
  }
  req.flash = (type, text) =>
    res.cookie('flash', JSON.stringify({ type, text }), { httpOnly: true, sameSite: 'lax', maxAge: 60000 });
  next();
});

// Layout data: sidebar state, active nav link, badge counts
app.use(async (req, res, next) => {
  // Capture the full path now: inside mounted routers Express rewrites req.path (e.g. "/requests" -> "/")
  const path = req.path.replace(/\/+$/, '') || '/';
  const query = req.query;
  res.locals.currentPath = path;
  res.locals.sidebarCollapsed = req.cookies.sidebar === 'collapsed';
  res.locals.nav = stats.EMPTY_NAV;

  res.locals.navLink = (href, iconName, label, count) => {
    const u = new URL(href, 'http://local');
    let active;
    if (u.search) {
      active = path === u.pathname && [...u.searchParams].every(([k, v]) => query[k] === v);
    } else if (href === '/') {
      active = path === '/';
    } else if (path === href) {
      active = !['status', 'category', 'aidType', 'urgency'].some((k) => query[k]);
    } else {
      active = path.startsWith(href + '/') && !path.endsWith('/new');
    }
    // Only show a count when there is something to count
    const badge = count ? `<span class="badge">${count}</span>` : '';
    return `<a href="${href}" class="nav-link${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''} title="${label}">${icon(iconName)}<span class="label">${label}</span>${badge}</a>`;
  };

  if (req.method === 'GET' && mongoose.connection.readyState === 1) {
    try {
      res.locals.nav = await stats.navCounts();
    } catch (err) {
      console.error('Nav counts failed:', err.message);
    }
  }
  next();
});

// Dashboard
app.get('/', async (req, res, next) => {
  try {
    const d = await stats.dashboard();
    res.render('index', { title: 'Dashboard', d });
  } catch (err) {
    next(err);
  }
});

app.use('/resources', require('./routes/resources'));
app.use('/requests', require('./routes/requests'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    message: "The page you're looking for doesn't exist or has been removed.",
    status: 404,
  });
});

// Error handler
app.use((err, req, res, next) => {
  const notFound = err.name === 'CastError';
  if (!notFound) console.error(err);
  const status = notFound ? 404 : err.status || 500;
  res.status(status).render('error', {
    title: notFound ? 'Record not found' : 'Something went wrong',
    message: notFound
      ? 'That record does not exist. It may have been deleted.'
      : 'An unexpected error occurred. Please try again.',
    status,
  });
});

async function start(uri = MONGODB_URI, port = PORT) {
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  return new Promise((resolve, reject) => {
    // Express 5 passes listen errors (e.g. port in use) to this callback
    const server = app.listen(port, (err) => {
      if (err) {
        if (err.code === 'EADDRINUSE') err.message = `Port ${port} is already in use. Set a different PORT in .env`;
        return reject(err);
      }
      console.log(`Server running at http://localhost:${server.address().port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start()
    .then((server) => {
      const shutdown = () => {
        console.log('Shutting down...');
        server.close(() => mongoose.disconnect().then(() => process.exit(0)));
        setTimeout(() => process.exit(1), 5000).unref();
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = { app, start };
