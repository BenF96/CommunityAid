// Small display helpers available in every template (app.locals)

// Amounts are in Philippine pesos, e.g. ₱1,945.00
const CURRENCY = 'PHP';
const CURRENCY_SYMBOL = '₱';
const pesoFormat = new Intl.NumberFormat('en-PH', { style: 'currency', currency: CURRENCY });

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return pesoFormat.format(Number(n));
}

function date(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function dateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function timeAgo(d) {
  if (!d) return '-';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)} h ago`;
  const days = h / 24;
  if (days < 30) return `${Math.floor(days)} d ago`;
  return date(d);
}

function daysBetween(a, b = new Date()) {
  return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 86400000));
}

function pct(part, total) {
  return total ? Math.round((part * 100) / total) : 0;
}

function truncate(text, len = 120) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len).trimEnd() + '…' : text;
}

const STATUS_LABELS = { pending: 'Pending', 'in-progress': 'In progress', fulfilled: 'Fulfilled' };
const URGENCY_LABELS = { 1: 'Low', 2: 'Medium', 3: 'High' };
const statusLabel = (s) => STATUS_LABELS[s] || s;
const urgencyLabel = (u) => URGENCY_LABELS[u] || '-';

module.exports = {
  money, CURRENCY, CURRENCY_SYMBOL, date, dateTime, timeAgo, daysBetween, pct, truncate,
  statusLabel, urgencyLabel, STATUS_LABELS, URGENCY_LABELS,
};
