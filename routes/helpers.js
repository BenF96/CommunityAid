const PAGE_SIZE = 10;

// Turn a Mongoose ValidationError into a list of readable messages
function validationMessages(err) {
  if (err && err.name === 'ValidationError') {
    return Object.values(err.errors).map((e) =>
      e.name === 'CastError' ? `Invalid value for ${e.path}` : e.message
    );
  }
  return null;
}

// Escape user text before using it in a RegExp search
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Query values can be arrays (?q=a&q=b); only accept plain strings
function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Page maths + a helper that builds links keeping the current filters
function paginate(req, total, pageSize = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(parseInt(str(req.query.page), 10) || 1, 1), pages);
  return {
    page,
    pages,
    total,
    skip: (page - 1) * pageSize,
    limit: pageSize,
    from: total ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, total),
    link(p) {
      const q = new URLSearchParams();
      Object.entries(req.query).forEach(([k, v]) => {
        if (k !== 'page' && typeof v === 'string' && v) q.set(k, v);
      });
      if (p > 1) q.set('page', p);
      const s = q.toString();
      return req.baseUrl + (s ? '?' + s : '');
    },
  };
}

// CSV cell: quote when needed and neutralise spreadsheet formulas
function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const isSafePath = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');

module.exports = { validationMessages, escapeRegex, str, paginate, csvCell, isSafePath, PAGE_SIZE };
