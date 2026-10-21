/* Social Wave — booking widget
 * Renders into any element with [data-booking]. Used on /plan and the lead pages in /v/.
 * Talks to /api/slots and /api/book. On preview hosts it shows sample times.
 *
 * Flow (one thing per screen, Calendly style): pick a day → pick a time → a few short question steps → done.
 * Steps whose fields are all prefilled through data-name/company are skipped.
 */
(function () {
  'use strict';
  var mount = document.querySelector('[data-booking]');
  if (!mount) return;

  var TZ = 'Europe/Amsterdam';
  var ICON = mount.getAttribute('data-icon') || '/site/media/sw-icon.png';
  var isLive = /socialwave-agency\.nl$|vercel\.app$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
  var WD = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

  function fmt(d, o) { return new Intl.DateTimeFormat('nl-NL', Object.assign({ timeZone: TZ }, o)).format(d); }
  function hhmm(d) { return fmt(d, { hour: '2-digit', minute: '2-digit' }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function keyOf(d) { // YYYY-MM-DD in Amsterdam
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function dayLabel(key, o) { return cap(fmt(new Date(key + 'T12:00:00Z'), o || { weekday: 'long', day: 'numeric', month: 'long' })); }
  var emailOk = function (v) { return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v); };
  var chev = function (dir) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>'; };
  var globe = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>';
  var cal = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  var back = function () { return '<button type="button" class="wgt__back" data-back>' + chev('l') + 'Terug</button>'; };

  // The question steps. A step whose fields are all prefilled is skipped; the last one books.
  var QUESTIONS = [
    { title: 'Wie zit er straks aan de andere kant?', fields: [
      { id: 'wName', name: 'name', ph: 'Je naam', ac: 'name', req: true },
      { id: 'wCompany', name: 'company', ph: 'Bedrijfsnaam', ac: 'organization', req: true }
    ] },
    { title: 'Hoe kan ik je bereiken?', fields: [
      { id: 'wEmail', name: 'email', ph: 'E-mailadres', type: 'email', ac: 'email', req: true },
      { id: 'wPhone', name: 'phone', ph: 'Telefoonnummer', type: 'tel', ac: 'tel', req: true }
    ] },
    { title: 'Nog iets wat ik moet weten?', sub: 'Mag je ook leeg laten.', fields: [
      { id: 'wSite', name: 'site', ph: 'Website', mode: 'url', ac: 'url' },
      { id: 'wNote', name: 'note', ph: 'Iets over je bedrijf of je vraag', area: true }
    ] }
  ];

  function fieldHtml(f) {
    var common = ' id="' + f.id + '" name="' + f.name + '" placeholder="' + f.ph + '" aria-label="' + f.ph + '"' +
      (f.ac ? ' autocomplete="' + f.ac + '"' : '');
    return f.area ? '<textarea' + common + ' rows="3"></textarea>'
      : '<input' + common + (f.type ? ' type="' + f.type + '"' : ' type="text"') + (f.mode ? ' inputmode="' + f.mode + '"' : '') + '>';
  }

  mount.innerHTML =
    '<div class="wgt__head">' +
      '<img class="wgt__icon" src="' + ICON + '" alt="">' +
      '<div class="wgt__titles"><div class="wgt__title">Kennismaking</div><div class="wgt__sub">15 min · Videocall</div></div>' +
      '<span class="wgt__badge" hidden>Voorbeeld</span>' +
    '</div>' +

    '<div class="wgt__step" data-step="day">' +
      '<div class="wgt__h">Kies een dag</div>' +
      '<div class="wgt__month"><span class="wgt__mlabel">&nbsp;</span>' +
        '<div class="wgt__nav"><button type="button" class="wgt__arrow" data-prev aria-label="Vorige maand">' + chev('l') + '</button>' +
        '<button type="button" class="wgt__arrow" data-next aria-label="Volgende maand">' + chev('r') + '</button></div></div>' +
      '<div class="wgt__wd">' + WD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="wgt__grid" role="grid" aria-label="Kies een dag"></div>' +
      '<p class="wgt__fail" data-fail hidden></p>' +
    '</div>' +

    '<div class="wgt__step" data-step="time" hidden>' +
      back() +
      '<div class="wgt__h">Kies een tijd</div>' +
      '<div class="wgt__slots" aria-live="polite"></div>' +
    '</div>' +

    QUESTIONS.map(function (q, i) {
      var last = i === QUESTIONS.length - 1;
      return '<form class="wgt__step" data-step="q' + i + '" hidden novalidate>' +
        back() +
        '<div class="wgt__progress"><i><b data-pbar></b></i></div>' +
        '<div class="wgt__h">' + q.title + '</div>' + (q.sub ? '<p class="wgt__hsub">' + q.sub + '</p>' : '') +
        '<div class="wgt__group">' + q.fields.map(fieldHtml).join('') + '</div>' +
        (last ? '<input type="text" name="hp" id="wHp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' : '') +
        '<button type="submit" class="wgt__cta"' + (last ? ' data-submit' : '') + '>' + (last ? 'Plan in' : 'Volgende') + '</button>' +
        '<p class="wgt__msg" data-msg></p>' +
      '</form>';
    }).join('') +

    '<div class="wgt__step wgt__done" data-step="done" hidden>' +
      '<span class="wgt__ring"></span>' +
      '<div class="wgt__dtitle">Gepland</div>' +
      '<p data-donetext></p>' +
      '<a class="wgt__meet" data-meet href="#" target="_blank" rel="noopener" hidden>Open Google Meet</a>' +
    '</div>' +

    '<div class="wgt__when" data-when hidden>' + cal + '<span data-crumb></span></div>' +
    '<div class="wgt__tz">' + globe + 'Tijden in Nederlandse tijd</div>';

  var $ = function (sel) { return mount.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(mount.querySelectorAll(sel)); };

  // Optional prefill from data attributes (the per-lead video pages in /v/)
  [['name', '#wName'], ['company', '#wCompany'], ['site', '#wSite']].forEach(function (p) {
    var v = mount.getAttribute('data-' + p[0]); if (v) $(p[1]).value = v;
  });
  // The company is already known on a lead page: no need to ask for it.
  if ($('#wCompany').value) $('#wCompany').hidden = true;
  var SOURCE = mount.getAttribute('data-source') || '';
  var TITLE = mount.getAttribute('data-title'); if (TITLE) $('.wgt__title').textContent = TITLE;
  // A question step is only shown when one of its required fields is still empty, or it is the last step.
  var qSteps = QUESTIONS.map(function (q, i) { return i; }).filter(function (i) {
    if (i === QUESTIONS.length - 1) return true;
    return QUESTIONS[i].fields.some(function (f) { return f.req && !$('#' + f.id).value.trim(); });
  });

  var el = {
    mlabel: $('.wgt__mlabel'), prev: $('[data-prev]'), next: $('[data-next]'),
    grid: $('.wgt__grid'), fail: $('[data-fail]'), slots: $('.wgt__slots'), badge: $('.wgt__badge'),
    doneText: $('[data-donetext]'), meet: $('[data-meet]'), submit: $('[data-submit]')
  };

  var state = { byDate: {}, months: [], mi: 0, selected: null, slot: null, demo: false, step: 'day' };
  var todayKey = keyOf(new Date());

  function demoDays() {
    var out = [], now = new Date();
    for (var i = 0; i < 29; i++) {
      var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var wd = day.getDay(); if (wd === 0 || wd === 6) continue;
      var slots = [];
      for (var m = 9 * 60; m + 15 <= 18 * 60; m += 15) {
        if ((m * 7 + i * 13) % 5 === 0) continue;
        var s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60);
        if (s.getTime() > Date.now() + 3 * 3600e3) slots.push(s.toISOString());
      }
      out.push({ date: keyOf(day), slots: slots });
    }
    return out;
  }

  function setDays(days) {
    state.byDate = {};
    days.forEach(function (d) { state.byDate[d.date] = d.slots; });
    var first = days[0] ? days[0].date : todayKey;
    var last = days.length ? days[days.length - 1].date : todayKey;
    state.months = [];
    var y = +first.slice(0, 4), m = +first.slice(5, 7);
    var ly = +last.slice(0, 4), lm = +last.slice(5, 7);
    while (y < ly || (y === ly && m <= lm)) { state.months.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
    // Open on the month of the first free day.
    var open = days.filter(function (d) { return d.slots.length; })[0];
    state.mi = 0;
    if (open) state.months.forEach(function (mm, i) { if (+open.date.slice(0, 4) === mm[0] && +open.date.slice(5, 7) === mm[1]) state.mi = i; });
    return !!open;
  }

  function renderMonth() {
    if (!state.months.length) return;
    var ym = state.months[state.mi], y = ym[0], m = ym[1];
    el.mlabel.textContent = fmt(new Date(Date.UTC(y, m - 1, 15, 12)), { month: 'long', year: 'numeric' });
    el.prev.disabled = state.mi === 0;
    el.next.disabled = state.mi === state.months.length - 1;
    var firstWd = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
    var daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var html = '';
    for (var i = 0; i < firstWd; i++) html += '<span class="wgt__cell is-blank"></span>';
    for (var d = 1; d <= daysIn; d++) {
      var key = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var slots = state.byDate[key] || [];
      var cls = 'wgt__cell' + (slots.length ? ' is-open' : '') + (key === todayKey ? ' is-today' : '') + (key === state.selected ? ' is-sel' : '');
      var label = dayLabel(key) + (slots.length ? ', ' + slots.length + ' tijden vrij' : ', niet beschikbaar');
      html += '<button type="button" class="' + cls + '" data-date="' + key + '"' + (slots.length ? '' : ' disabled') + ' aria-label="' + label + '">' + d + '</button>';
    }
    el.grid.innerHTML = html;
  }

  function renderTimes() {
    var slots = state.byDate[state.selected] || [];
    el.slots.innerHTML = slots.map(function (iso) {
      return '<button type="button" class="wgt__time" data-iso="' + iso + '">' + hhmm(new Date(iso)) + '</button>';
    }).join('') || '<p class="wgt__none">Geen tijden meer vrij op deze dag.</p>';
  }

  function crumb() {
    if (!state.selected) return '';
    var d = dayLabel(state.selected, { weekday: 'short', day: 'numeric', month: 'short' });
    if (!state.slot) return d;
    var s = new Date(state.slot), en = new Date(s.getTime() + 15 * 60000);
    return d + ' · ' + hhmm(s) + ' – ' + hhmm(en);
  }

  function show(step) {
    state.step = step;
    $$('.wgt__step').forEach(function (s) { s.hidden = s.dataset.step !== step; });
    $('[data-crumb]').textContent = crumb();
    $('[data-when]').hidden = step === 'day' || step === 'done' || !state.selected;
    var qi = step.charAt(0) === 'q' ? qSteps.indexOf(+step.slice(1)) : -1;
    if (qi >= 0) {
      var form = $('[data-step="' + step + '"]');
      form.querySelector('[data-pbar]').style.width = ((qi + 1) / qSteps.length * 100) + '%';
      var msg = form.querySelector('[data-msg]'); msg.textContent = ''; msg.classList.remove('err');
      var empty = Array.prototype.filter.call(form.querySelectorAll('input:not(.hp), textarea'), function (i) { return !i.hidden && !i.value.trim(); })[0];
      setTimeout(function () { (empty || form.querySelector('.wgt__cta')).focus({ preventScroll: true }); }, 60);
    }
  }

  function prevStep() {
    if (state.step === 'time') { state.selected = null; renderMonth(); return show('day'); }
    var qi = qSteps.indexOf(+state.step.slice(1));
    if (qi > 0) return show('q' + qSteps[qi - 1]);
    state.slot = null; show('time');
  }

  function loading() {
    el.grid.innerHTML = new Array(36).join('<span class="wgt__cell is-skel"></span>');
  }

  function fail(msg) {
    el.grid.innerHTML = '';
    el.mlabel.textContent = 'Plannen';
    el.prev.disabled = el.next.disabled = true;
    el.fail.textContent = msg; el.fail.hidden = false;
  }

  function load() {
    loading(); el.fail.hidden = true;
    return fetch('/api/slots', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { state.demo = false; return j.days || []; })
      .catch(function () { if (isLive) throw new Error('down'); state.demo = true; return demoDays(); })
      .then(function (days) {
        el.badge.hidden = !state.demo;
        var anyOpen = setDays(days);
        renderMonth();
        if (!anyOpen) fail('De komende weken zijn vol. Stuur ons een bericht, dan zoeken we samen een moment.');
      })
      .catch(function () { fail('De agenda is even niet bereikbaar. Probeer het later opnieuw of stuur ons een bericht.'); });
  }

  /* ---------- Events ---------- */
  el.prev.addEventListener('click', function () { state.mi--; renderMonth(); });
  el.next.addEventListener('click', function () { state.mi++; renderMonth(); });
  el.grid.addEventListener('click', function (e) {
    var b = e.target.closest('.wgt__cell.is-open'); if (!b) return;
    state.selected = b.dataset.date; state.slot = null;
    renderMonth(); renderTimes();
    setTimeout(function () { show('time'); }, 140);
  });
  el.slots.addEventListener('click', function (e) {
    var b = e.target.closest('.wgt__time[data-iso]'); if (!b) return;
    state.slot = b.dataset.iso;
    b.classList.add('is-picked');
    setTimeout(function () { show('q' + qSteps[0]); }, 160);
  });
  $$('[data-back]').forEach(function (b) { b.addEventListener('click', prevStep); });
  $$('.wgt__group input, .wgt__group textarea').forEach(function (i) {
    i.addEventListener('input', function () { i.classList.remove('bad'); });
  });

  function checkStep(form, idx) {
    var bad = [];
    QUESTIONS[idx].fields.forEach(function (f) {
      var i = $('#' + f.id), v = i.value.trim(), wrong = false;
      if (f.req && !v) wrong = true;
      if (f.name === 'email' && v && !emailOk(v)) wrong = true;
      if (f.name === 'phone' && v.replace(/[^0-9]/g, '').length < 8) wrong = true;
      i.classList.toggle('bad', wrong); if (wrong) bad.push(f);
    });
    var msg = form.querySelector('[data-msg]');
    msg.classList.toggle('err', bad.length > 0);
    msg.textContent = !bad.length ? ''
      : bad[0].name === 'email' ? 'Vul een geldig e-mailadres in.'
      : bad[0].name === 'phone' ? 'Vul je telefoonnummer in, zodat ik je kan bellen als de videocall niet lukt.'
      : 'Vul je naam en bedrijf in.';
    return !bad.length;
  }

  QUESTIONS.forEach(function (q, idx) {
    var form = $('[data-step="q' + idx + '"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!checkStep(form, idx)) return;
      var qi = qSteps.indexOf(idx);
      if (qi < qSteps.length - 1) return show('q' + qSteps[qi + 1]);
      book(form);
    });
  });

  function book(form) {
    // Prefilled steps were skipped: they still have to be valid.
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (qSteps.indexOf(i) < 0 && !checkStep($('[data-step="q' + i + '"]'), i)) return show('q' + i);
    }
    var v = function (id) { return $('#' + id).value.trim(); };
    var note = v('wNote');
    var payload = {
      start: state.slot, name: v('wName'), company: v('wCompany'), site: v('wSite'),
      email: v('wEmail'), phone: v('wPhone'), note: note + (SOURCE ? (note ? '\n\n' : '') + '[' + SOURCE + ']' : ''),
      hp: $('#wHp').value, source: SOURCE
    };
    var s = new Date(state.slot);
    var when = fmt(s, { weekday: 'long', day: 'numeric', month: 'long' }) + ' om ' + hhmm(s);
    var msg = form.querySelector('[data-msg]');
    function done(meet) {
      show('done');
      el.doneText.textContent = cap(when) + '. Je krijgt zo een bevestiging met de videolink in je mail.' +
        (state.demo ? ' (Voorbeeld, er is niets ingepland.)' : '');
      if (meet) { el.meet.href = meet; el.meet.hidden = false; }
    }
    if (state.demo) { done(null); return; }

    el.submit.disabled = true; el.submit.textContent = 'Inplannen…';
    fetch('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); })
      .then(function (j) {
        el.submit.disabled = false; el.submit.textContent = 'Plan in';
        if (j.ok) return done(j.meet);
        msg.classList.add('err');
        if (j._status === 409) {
          msg.textContent = 'Dit moment is net vergeven. Kies een ander tijdstip.';
          setTimeout(function () { state.selected = null; state.slot = null; show('day'); load(); }, 1500);
        } else {
          msg.textContent = 'Inplannen lukte niet. Probeer het opnieuw.';
        }
      })
      .catch(function () {
        el.submit.disabled = false; el.submit.textContent = 'Plan in';
        msg.textContent = 'Geen verbinding. Probeer het opnieuw.'; msg.classList.add('err');
      });
  }

  load();
})();
