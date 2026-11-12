// Community Assistance and Resource System - small progressive enhancements. The app works without JavaScript.
(function () {
  'use strict';

  var body = document.body;
  var mobile = window.matchMedia('(max-width: 960px)');
  var hamburger = document.querySelector('.hamburger');

  // ---- Sidebar / hamburger -------------------------------------------------
  // Desktop: collapse to an icon rail (remembered in a cookie so the server renders it).
  // Mobile: slide-in drawer with a backdrop.
  function setExpanded() {
    if (!hamburger) return;
    var open = mobile.matches ? body.classList.contains('sidebar-open') : !body.classList.contains('sidebar-collapsed');
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function toggleSidebar() {
    if (mobile.matches) {
      body.classList.toggle('sidebar-open');
      if (body.classList.contains('sidebar-open')) {
        var first = document.querySelector('.sidebar .nav-link');
        if (first) first.focus();
      }
    } else {
      body.classList.toggle('sidebar-collapsed');
      var value = body.classList.contains('sidebar-collapsed') ? 'collapsed' : 'expanded';
      document.cookie = 'sidebar=' + value + '; path=/; max-age=31536000; samesite=lax';
    }
    setExpanded();
  }

  function closeSidebar() {
    if (body.classList.contains('sidebar-open')) {
      body.classList.remove('sidebar-open');
      setExpanded();
      if (hamburger) hamburger.focus();
    }
  }

  mobile.addEventListener('change', function () {
    body.classList.remove('sidebar-open');
    setExpanded();
  });
  setExpanded();

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });

  // ---- Delegated click actions ---------------------------------------------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'close-sidebar') closeSidebar();
    else if (action === 'print') window.print();
    else if (action === 'toggle-filters') {
      var form = el.closest('.filters');
      var open = form.classList.toggle('expanded');
      el.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    else if (action === 'dismiss') {
      var box = el.closest('.flash');
      if (box) box.remove();
    }
  });

  // Close the mobile drawer after picking a link
  document.querySelectorAll('.sidebar a').forEach(function (a) {
    a.addEventListener('click', function () {
      if (mobile.matches) body.classList.remove('sidebar-open');
    });
  });

  // Filters fold away on phones only when JS is available to unfold them
  document.querySelectorAll('.filters').forEach(function (f) { f.classList.add('collapsible'); });

  // ---- Confirm destructive actions -----------------------------------------
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ---- Prevent double submits ----------------------------------------------
  document.querySelectorAll('form.form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        setTimeout(function () { btn.disabled = true; btn.classList.add('loading'); }, 0);
      }
    });
  });

  // ---- Show fields/panels only for the selected aid type -------------------
  function currentAidType() {
    var checked = document.querySelector('input[name="aidType"]:checked');
    if (checked) return checked.value;
    var select = document.querySelector('select[name="aidType"]');
    return select ? select.value : null;
  }
  function syncAidType() {
    var type = currentAidType();
    if (!type) return;
    document.querySelectorAll('[data-show-for]').forEach(function (el) {
      el.hidden = el.getAttribute('data-show-for') !== type;
    });
  }
  document.querySelectorAll('[name="aidType"]').forEach(function (el) {
    el.addEventListener('change', syncAidType);
  });
  syncAidType();

  // ---- Character counters --------------------------------------------------
  document.querySelectorAll('textarea[data-counter][maxlength]').forEach(function (ta) {
    var max = Number(ta.getAttribute('maxlength'));
    var counter = document.createElement('span');
    counter.className = 'counter';
    counter.setAttribute('aria-live', 'polite');
    ta.insertAdjacentElement('afterend', counter);
    function update() {
      counter.textContent = ta.value.length + ' / ' + max;
      counter.classList.toggle('near-limit', ta.value.length > max * 0.9);
    }
    ta.addEventListener('input', update);
    update();
  });

  // ---- Live date & time (viewer's own time zone) ---------------------------
  var liveDates = document.querySelectorAll('[data-live-date]');
  if (liveDates.length) {
    var fmt = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    var tick = function () {
      var now = new Date();
      liveDates.forEach(function (el) {
        el.textContent = now.toLocaleString('en-US', fmt).replace(/, (\d{1,2}:\d{2})/, ' · $1');
        el.setAttribute('datetime', now.toISOString());
      });
    };
    tick();
    // Update right at the start of each minute, then every minute
    setTimeout(function () { tick(); setInterval(tick, 60000); }, 60000 - (Date.now() % 60000));
  }

  // ---- Auto-hide success messages ------------------------------------------
  var flash = document.querySelector('.flash-success');
  if (flash) setTimeout(function () { flash.classList.add('fade'); }, 6000);
})();
