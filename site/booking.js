/* Social Wave — booking widget
 * Renders into any element with [data-booking]. Used on /website and /plan.
 * Talks to /api/slots and /api/book. On preview hosts it shows sample times.
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
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return p;
  }
  var emailOk = function (v) { return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v); };
  var chev = function (dir) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>'; };

  mount.innerHTML =
    '<div class="wgt__head">' +
      '<img class="wgt__icon" src="' + ICON + '" alt="">' +
      '<div class="wgt__titles"><div class="wgt__title">Kennismaking</div><div class="wgt__sub">15 min · Videocall</div></div>' +
      '<span class="wgt__badge" hidden>Voorbeeld</span>' +
    '</div>' +

    '<div class="wgt__step" data-step="1">' +
      '<div class="wgt__month"><span class="wgt__mlabel">&nbsp;</span>' +
        '<div class="wgt__nav"><button type="button" class="wgt__arrow" data-prev aria-label="Vorige maand">' + chev('l') + '</button>' +
        '<button type="button" class="wgt__arrow" data-next aria-label="Volgende maand">' + chev('r') + '</button></div></div>' +
      '<div class="wgt__wd">' + WD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="wgt__grid" role="grid" aria-label="Kies een dag"></div>' +
      '<div class="wgt__times"><div class="wgt__tlabel">&nbsp;</div><div class="wgt__strip" aria-live="polite"></div></div>' +
    '</div>' +

    '<form class="wgt__step" data-step="2" hidden novalidate>' +
      '<button type="button" class="wgt__back" data-back>' + chev('l') + '<span data-picked></span></button>' +
      '<div class="wgt__group">' +
        '<input id="wName" name="name" placeholder="Naam" autocomplete="name" aria-label="Naam">' +
        '<input id="wCompany" name="company" placeholder="Bedrijf" autocomplete="organization" aria-label="Bedrijf">' +
        '<input id="wSite" name="site" type="text" inputmode="url" placeholder="Website (optioneel)" autocomplete="url" aria-label="Website">' +
        '<input id="wEmail" name="email" type="email" placeholder="E-mail" autocomplete="email" aria-label="E-mail">' +
        '<input id="wPhone" name="phone" type="tel" placeholder="Telefoonnummer" autocomplete="tel" aria-label="Telefoonnummer">' +
        '<textarea id="wNote" name="note" rows="3" placeholder="Extra info over je bedrijf (optioneel)" aria-label="Extra info over je bedrijf"></textarea>' +
      '</div>' +
      '<input type="text" name="hp" id="wHp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button type="submit" class="wgt__cta" data-submit>Plan in</button>' +
      '<p class="wgt__msg" data-msg></p>' +
    '</form>' +

    '<div class="wgt__step wgt__done" data-step="3" hidden>' +
      '<span class="wgt__ring"></span>' +
      '<div class="wgt__dtitle">Gepland</div>' +
      '<p data-donetext></p>' +
      '<a class="wgt__meet" data-meet href="#" target="_blank" rel="noopener" hidden>Open Google Meet</a>' +
    '</div>';

  var $ = function (sel) { return mount.querySelector(sel); };
  var el = {
    s1: $('[data-step="1"]'), s2: $('[data-step="2"]'), s3: $('[data-step="3"]'),
    mlabel: $('.wgt__mlabel'), prev: $('[data-prev]'), next: $('[data-next]'),
    grid: $('.wgt__grid'), tlabel: $('.wgt__tlabel'), strip: $('.wgt__strip'),
    badge: $('.wgt__badge'), back: $('[data-back]'), picked: $('[data-picked]'),
    submit: $('[data-submit]'), msg: $('[data-msg]'), doneText: $('[data-donetext]'), meet: $('[data-meet]'),
    phone: $('#wPhone')
  };

  var state = { byDate: {}, months: [], mi: 0, selected: null, slot: null, demo: false };
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
    var open = days.filter(function (d) { return d.slots.length; })[0];
    if (!state.selected || !(state.byDate[state.selected] || []).length) state.selected = open ? open.date : null;
    state.mi = 0;
    if (state.selected) state.months.forEach(function (mm, i) { if (+state.selected.slice(0, 4) === mm[0] && +state.selected.slice(5, 7) === mm[1]) state.mi = i; });
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
      var label = fmt(new Date(key + 'T12:00:00Z'), { weekday: 'long', day: 'numeric', month: 'long' }) + (slots.length ? ', ' + slots.length + ' tijden vrij' : ', niet beschikbaar');
      html += '<button type="button" class="' + cls + '" data-date="' + key + '"' + (slots.length ? '' : ' disabled') + ' aria-label="' + label + '"' + (key === state.selected ? ' aria-pressed="true"' : '') + '>' + d + '</button>';
    }
    el.grid.innerHTML = html;
  }

  function renderTimes() {
    var slots = state.selected ? (state.byDate[state.selected] || []) : [];
    if (!state.selected) { el.tlabel.textContent = 'Kies een dag'; el.strip.innerHTML = ''; return; }
    el.tlabel.textContent = cap(fmt(new Date(state.selected + 'T12:00:00Z'), { weekday: 'long', day: 'numeric', month: 'long' }));
    el.strip.innerHTML = slots.map(function (iso) {
      return '<button type="button" class="wgt__time" data-iso="' + iso + '">' + hhmm(new Date(iso)) + '</button>';
    }).join('') || '<span class="wgt__none">Geen tijden meer vrij</span>';
    el.strip.scrollLeft = 0;
  }

  function show(step) {
    [el.s1, el.s2, el.s3].forEach(function (s, i) { s.hidden = (i + 1) !== step; });
  }

  function loading() {
    el.grid.innerHTML = new Array(36).join('<span class="wgt__cell is-skel"></span>');
    el.tlabel.innerHTML = '&nbsp;';
    el.strip.innerHTML = new Array(6).join('<span class="wgt__time is-skel"></span>');
  }

  function fail(msg) {
    el.grid.innerHTML = '';
    el.mlabel.textContent = 'Plannen';
    el.prev.disabled = el.next.disabled = true;
    el.tlabel.textContent = '';
    el.strip.innerHTML = '<p class="wgt__fail">' + msg + '</p>';
  }

  function load() {
    loading();
    return fetch('/api/slots', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { state.demo = false; return j.days || []; })
      .catch(function () { if (isLive) throw new Error('down'); state.demo = true; return demoDays(); })
      .then(function (days) {
        el.badge.hidden = !state.demo;
        setDays(days);
        if (!state.selected) { renderMonth(); fail('De komende weken zijn vol. Stuur ons een bericht, dan zoeken we samen een moment.'); return; }
        renderMonth(); renderTimes();
      })
      .catch(function () { fail('De agenda is even niet bereikbaar. Probeer het later opnieuw of stuur ons een bericht.'); });
  }

  /* ---------- Events ---------- */
  el.prev.addEventListener('click', function () { state.mi--; renderMonth(); });
  el.next.addEventListener('click', function () { state.mi++; renderMonth(); });
  el.grid.addEventListener('click', function (e) {
    var b = e.target.closest('.wgt__cell.is-open'); if (!b) return;
    state.selected = b.dataset.date; renderMonth(); renderTimes();
  });
  // vertical mouse wheel scrolls the time strip sideways
  el.strip.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.strip.scrollWidth > el.strip.clientWidth) {
      el.strip.scrollLeft += e.deltaY; e.preventDefault();
    }
  }, { passive: false });
  el.strip.addEventListener('click', function (e) {
    var b = e.target.closest('.wgt__time[data-iso]'); if (!b) return;
    state.slot = b.dataset.iso;
    b.classList.add('is-picked');
    var s = new Date(state.slot), en = new Date(s.getTime() + 15 * 60000);
    el.picked.textContent = cap(fmt(s, { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + hhmm(s) + ' – ' + hhmm(en);
    setTimeout(function () {
      show(2); el.msg.textContent = ''; el.msg.classList.remove('err');
      $('#wName').focus({ preventScroll: true });
    }, 160);
  });
  el.back.addEventListener('click', function () { show(1); state.slot = null; renderTimes(); });
  mount.querySelectorAll('.wgt__group input, .wgt__group textarea').forEach(function (i) {
    i.addEventListener('input', function () { i.classList.remove('bad'); });
  });

  el.s2.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = { name: $('#wName'), company: $('#wCompany'), site: $('#wSite'), email: $('#wEmail'), phone: $('#wPhone'), note: $('#wNote') };
    var checks = [
      [f.name, !f.name.value.trim()],
      [f.company, !f.company.value.trim()],
      [f.email, !emailOk(f.email.value.trim())],
      [f.phone, f.phone.value.replace(/[^0-9]/g, '').length < 8]
    ];
    var bad = false;
    checks.forEach(function (c) { c[0].classList.toggle('bad', c[1]); if (c[1]) bad = true; });
    el.msg.classList.remove('err');
    if (bad) { el.msg.textContent = 'Vul naam, bedrijf, e-mail en telefoonnummer in.'; el.msg.classList.add('err'); return; }

    var payload = {
      start: state.slot, name: f.name.value.trim(), company: f.company.value.trim(), site: f.site.value.trim(),
      email: f.email.value.trim(), phone: f.phone.value.trim(), note: f.note.value.trim(), hp: $('#wHp').value
    };
    var s = new Date(state.slot);
    var when = fmt(s, { weekday: 'long', day: 'numeric', month: 'long' }) + ' om ' + hhmm(s);
    function done(meet) {
      show(3);
      el.doneText.textContent = cap(when) + '. ' + 'De uitnodiging met videolink staat in je mail.' +
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
        el.msg.classList.add('err');
        if (j._status === 409) {
          el.msg.textContent = 'Dit moment is net vergeven. Kies een ander tijdstip.';
          setTimeout(function () { show(1); load(); }, 1500);
        } else {
          el.msg.textContent = 'Inplannen lukte niet. Probeer het opnieuw.';
        }
      })
      .catch(function () {
        el.submit.disabled = false; el.submit.textContent = 'Plan in';
        el.msg.textContent = 'Geen verbinding. Probeer het opnieuw.'; el.msg.classList.add('err');
      });
  });

  load();
})();
