/* Social Wave — site interactions */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Nav ---------- */
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  document.querySelectorAll('#navLinks a').forEach(function (a) {
    a.addEventListener('click', function () { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', false); });
  });

  /* ---------- Reveal on scroll ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(function (el, i) {
    el.style.transitionDelay = (el.closest('.hero') ? i * 0.08 : 0) + 's';
    io.observe(el);
  });
  // stagger grids
  document.querySelectorAll('.steps .step, .bento .tile').forEach(function (el, i) {
    el.style.transitionDelay = ((i % 3) * 0.08) + 's';
  });

  /* ---------- Hero: Muse-style prompt + chat ---------- */
  var script = [
    { q: 'Meer reserveringen op doordeweekse avonden', a: 'Komt goed. Reels, een e-mailcampagne en een actie voor dinsdag t/m donderdag.' },
    { q: 'Een volle zaal bij onze opening', a: 'Launchvideo, social campagne en een countdown. Plan staat klaar.' },
    { q: 'Meer Google-reviews van blije gasten', a: 'QR-kaartjes op tafel. Blije gasten naar Google, feedback naar jou.' },
    { q: 'Meer aanvragen voor ons bouwbedrijf', a: 'Projectvideo’s, voor-en-na content en een gerichte campagne.' },
    { q: 'Een merk dat opvalt op Instagram', a: 'Shootdag, contentkalender en een vaste huisstijl. We beginnen maandag.' }
  ];
  var typed = document.getElementById('typed');
  var prompt = document.getElementById('prompt');
  var chat = document.getElementById('chat');
  var step = 0;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  async function typeText(text) {
    typed.textContent = '';
    for (var i = 0; i < text.length; i++) {
      typed.textContent += text[i];
      await wait(28 + Math.random() * 38);
    }
  }

  async function loop() {
    if (reduce) {
      typed.textContent = script[0].q;
      chat.appendChild(el('<div class="msg msg--out"><span class="bub bub--out">' + script[0].q + '</span></div>'));
      chat.appendChild(el('<div class="msg msg--in"><span class="msg__from"><img src="/site/media/sw-icon.png" alt="">Social Wave</span><span class="bub bub--in">' + script[0].a + '<span class="check">✓</span></span></div>'));
      typed.textContent = '';
      return;
    }
    await wait(900);
    while (true) {
      var s = script[step % script.length];
      await typeText(s.q);
      prompt.classList.add('ready');
      await wait(520);
      prompt.classList.add('sending');
      await wait(160);
      prompt.classList.remove('sending', 'ready');
      typed.textContent = '';
      var out = el('<div class="msg msg--out"><span class="bub bub--out"></span></div>');
      out.firstChild.textContent = s.q;
      chat.appendChild(out);
      await wait(450);
      var typing = el('<div class="msg msg--in"><span class="msg__from"><img src="/site/media/sw-icon.png" alt="">Social Wave maakt je plan…</span><span class="bub bub--in typing"><i></i><i></i><i></i></span></div>');
      chat.appendChild(typing);
      await wait(1400);
      var reply = el('<div class="msg msg--in"><span class="msg__from"><img src="/site/media/sw-icon.png" alt="">Social Wave</span><span class="bub bub--in"></span></div>');
      reply.lastChild.textContent = s.a;
      reply.lastChild.appendChild(el('<span class="check">✓</span>'));
      chat.replaceChild(reply, typing);
      await wait(3400);
      [out, reply].forEach(function (m) { m.classList.add('leaving'); });
      await wait(460);
      chat.innerHTML = '';
      step++;
      await wait(250);
    }
  }
  loop();

  /* ---------- Statement word fill ---------- */
  var st = document.getElementById('statement');
  if (st) {
    var words = st.textContent.trim().split(/\s+/);
    st.innerHTML = words.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
    var spans = st.querySelectorAll('.w');
    var onScroll = function () {
      var r = st.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = (vh * 0.85 - r.top) / (r.height + vh * 0.35);
      p = Math.max(0, Math.min(1, p));
      var n = Math.round(p * spans.length);
      spans.forEach(function (s, i) { s.classList.toggle('on', i < n); });
    };
    if (reduce) spans.forEach(function (s) { s.classList.add('on'); });
    else { window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  }

  /* ---------- Case videos: play only when visible ---------- */
  var vio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting && !reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    });
  }, { threshold: 0.25 });
  document.querySelectorAll('.case__video').forEach(function (v) { v.removeAttribute('autoplay'); v.pause(); vio.observe(v); });

  /* ---------- Film modal ---------- */
  var modal = document.getElementById('modal');
  var mv = document.getElementById('modalVideo');
  function openFilm(src, poster) {
    mv.src = src; mv.poster = poster || '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var p = mv.play(); if (p && p.catch) p.catch(function () {});
  }
  function closeFilm() {
    mv.pause(); mv.removeAttribute('src'); mv.load();
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  document.querySelectorAll('[data-film]').forEach(function (b) {
    b.addEventListener('click', function () { openFilm(b.dataset.film, b.dataset.poster); });
  });
  modal.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeFilm); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeFilm(); });

  /* ---------- Helpers ---------- */
  var TZ = 'Europe/Amsterdam';
  function fmt(date, opts) { return new Intl.DateTimeFormat('nl-NL', Object.assign({ timeZone: TZ }, opts)).format(date); }
  function hhmm(d) { return fmt(d, { hour: '2-digit', minute: '2-digit' }); }
  function postJSON(url, data) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }
  function markInvalid(input, bad) { input.closest('.field').classList.toggle('invalid', bad); return bad; }
  var emailOk = function (v) { return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v); };
  // Demo data only on preview hosts (never on the real domain)
  var isLiveHost = /socialwave-agency\.nl$|vercel\.app$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);

  /* ---------- Booking (eigen planner) ---------- */
  var bk = {
    days: [], week: 0, selected: null, slot: null, demo: false,
    els: {
      days: document.getElementById('bkDays'), times: document.getElementById('bkTimes'),
      month: document.getElementById('bkMonth'), prev: document.getElementById('bkPrev'), next: document.getElementById('bkNext'),
      s1: document.getElementById('bkStep1'), s2: document.getElementById('bkStep2'), s3: document.getElementById('bkStep3'),
      picked: document.getElementById('bkPicked'), back: document.getElementById('bkBack'),
      submit: document.getElementById('bkSubmit'), note: document.getElementById('bkNote2'),
      doneText: document.getElementById('bkDoneText'), meet: document.getElementById('bkMeet'),
      phoneHint: document.getElementById('bkPhoneHint')
    }
  };

  function demoDays() {
    var out = [], d = new Date();
    for (var i = 0; out.length < 20; i++) {
      var day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      var wd = day.getDay(); if (wd === 0 || wd === 6) continue;
      var slots = [];
      for (var m = 9 * 60; m + 15 <= 18 * 60; m += 15) {
        if ((m * 7 + i * 13) % 5 === 0) continue; // a few taken
        var s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60);
        if (s.getTime() > Date.now() + 3 * 3600e3) slots.push(s.toISOString());
      }
      var iso = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
      out.push({ date: iso, slots: slots });
    }
    return out;
  }

  function weeks() {
    // group weekdays into Mon–Fri rows
    var rows = [], cur = null;
    bk.days.forEach(function (d) {
      var dt = new Date(d.date + 'T12:00:00Z');
      var wd = dt.getUTCDay();
      if (!cur || wd === 1 || cur.lastWd >= wd) { cur = { days: new Array(5).fill(null), lastWd: wd }; rows.push(cur); }
      cur.days[wd - 1] = d; cur.lastWd = wd;
    });
    return rows.map(function (r) { return r.days; });
  }

  function renderDays() {
    var all = weeks();
    if (!all.length) return;
    bk.week = Math.max(0, Math.min(bk.week, all.length - 1));
    var row = all[bk.week];
    bk.els.prev.disabled = bk.week === 0;
    bk.els.next.disabled = bk.week === all.length - 1;
    var first = row.filter(Boolean)[0];
    bk.els.month.innerHTML = fmt(new Date(first.date + 'T12:00:00Z'), { month: 'long', year: 'numeric' }) + (bk.demo ? '<span class="bk-demo">Voorbeeld</span>' : '');
    var labels = ['ma', 'di', 'wo', 'do', 'vr'];
    bk.els.days.innerHTML = '';
    row.forEach(function (d, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'bk-day'; b.setAttribute('role', 'option');
      if (!d) { b.disabled = true; b.innerHTML = '<span class="bk-day__wd">' + labels[i] + '</span><span class="bk-day__n">&nbsp;</span><span class="bk-day__dot"></span>'; bk.els.days.appendChild(b); return; }
      var n = Number(d.date.slice(8, 10));
      b.innerHTML = '<span class="bk-day__wd">' + labels[i] + '</span><span class="bk-day__n">' + n + '</span><span class="bk-day__dot"></span>';
      b.disabled = !d.slots.length;
      b.setAttribute('aria-selected', String(bk.selected === d.date));
      b.setAttribute('aria-label', fmt(new Date(d.date + 'T12:00:00Z'), { weekday: 'long', day: 'numeric', month: 'long' }) + (d.slots.length ? ', ' + d.slots.length + ' tijden vrij' : ', vol'));
      b.addEventListener('click', function () { bk.selected = d.date; renderDays(); renderTimes(); });
      bk.els.days.appendChild(b);
    });
  }

  function renderTimes() {
    var d = bk.days.filter(function (x) { return x.date === bk.selected; })[0];
    var box = bk.els.times;
    if (!d) { box.innerHTML = '<div class="bk-empty">Kies een dag om de vrije tijden te zien.</div>'; return; }
    var am = [], pm = [];
    d.slots.forEach(function (iso) {
      var t = new Date(iso);
      (Number(fmt(t, { hour: '2-digit', hourCycle: 'h23' })) < 12 ? am : pm).push(t);
    });
    var html = '';
    [['Ochtend', am], ['Middag', pm]].forEach(function (g) {
      if (!g[1].length) return;
      html += '<div class="bk-group"><div class="bk-group__label">' + g[0] + '</div><div class="bk-grid">' +
        g[1].map(function (t) { return '<button type="button" class="bk-time" data-iso="' + t.toISOString() + '">' + hhmm(t) + '</button>'; }).join('') +
        '</div></div>';
    });
    box.innerHTML = html || '<div class="bk-empty">Geen tijden meer vrij op deze dag.</div>';
    box.querySelectorAll('.bk-time').forEach(function (b) {
      b.addEventListener('click', function () { pickSlot(b.dataset.iso, b); });
    });
  }

  function pickSlot(iso, btn) {
    bk.slot = iso;
    if (btn) btn.classList.add('is-picked');
    var s = new Date(iso), e = new Date(s.getTime() + 15 * 60000);
    bk.els.picked.innerHTML = fmt(s, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, function (c) { return c.toUpperCase(); }) +
      '<small>' + hhmm(s) + ' – ' + hhmm(e) + '</small>';
    bk.els.picked.hidden = false;
    setTimeout(function () {
      bk.els.s1.hidden = true; bk.els.s2.hidden = false;
      bk.els.note.textContent = ''; bk.els.note.classList.remove('err');
      document.getElementById('bkName').focus({ preventScroll: true });
    }, btn ? 180 : 0);
  }

  function showError(msg) {
    bk.els.times.innerHTML = '<div class="bk-empty">' + msg + '</div>';
    bk.els.days.innerHTML = ''; bk.els.month.textContent = 'Plannen';
    bk.els.prev.disabled = bk.els.next.disabled = true;
  }

  function loadSlots() {
    bk.els.times.innerHTML = '<div class="bk-skel">' + new Array(12).join('<i></i>') + '</div>';
    return fetch('/api/slots', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { bk.demo = false; return j.days || []; })
      .catch(function () {
        if (isLiveHost) throw new Error('unavailable');
        bk.demo = true; return demoDays();
      })
      .then(function (days) {
        bk.days = days;
        var firstOpen = days.filter(function (d) { return d.slots.length; })[0];
        if (!firstOpen) { showError('Er zijn de komende weken geen tijden vrij. Stuur ons een bericht hieronder.'); return; }
        if (!bk.selected || !days.some(function (d) { return d.date === bk.selected && d.slots.length; })) bk.selected = firstOpen.date;
        var rows = weeks();
        rows.forEach(function (r, i) { if (r.some(function (d) { return d && d.date === bk.selected; })) bk.week = i; });
        renderDays(); renderTimes();
      })
      .catch(function () { showError('De agenda is nu even niet bereikbaar. Stuur ons hieronder een bericht, dan plannen we samen een moment.'); });
  }

  if (bk.els.days) {
    bk.els.prev.addEventListener('click', function () { bk.week--; renderDays(); });
    bk.els.next.addEventListener('click', function () { bk.week++; renderDays(); });
    bk.els.back.addEventListener('click', function () {
      bk.els.s2.hidden = true; bk.els.s1.hidden = false; bk.els.picked.hidden = true; bk.slot = null; renderTimes();
    });
    document.querySelectorAll('input[name=mode]').forEach(function (r) {
      r.addEventListener('change', function () {
        var phone = document.getElementById('bkModePhone').checked;
        bk.els.phoneHint.textContent = phone ? '(we bellen je hierop)' : '(optioneel)';
      });
    });
    bk.els.s2.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = {
        name: document.getElementById('bkName'), company: document.getElementById('bkCompany'),
        email: document.getElementById('bkEmail'), phone: document.getElementById('bkPhone'), note: document.getElementById('bkNote')
      };
      var mode = document.getElementById('bkModePhone').checked ? 'phone' : 'video';
      var bad = [
        markInvalid(f.name, !f.name.value.trim()),
        markInvalid(f.company, !f.company.value.trim()),
        markInvalid(f.email, !emailOk(f.email.value.trim())),
        markInvalid(f.phone, mode === 'phone' && !f.phone.value.trim())
      ].some(Boolean);
      bk.els.note.classList.remove('err');
      if (bad) { bk.els.note.textContent = mode === 'phone' ? 'Vul je naam, bedrijf, e-mail en telefoonnummer in.' : 'Vul je naam, bedrijf en e-mail in.'; bk.els.note.classList.add('err'); return; }

      var payload = {
        start: bk.slot, mode: mode, name: f.name.value.trim(), company: f.company.value.trim(),
        email: f.email.value.trim(), phone: f.phone.value.trim(), note: f.note.value.trim(),
        website: document.getElementById('bkHp').value
      };
      var s = new Date(bk.slot);
      var when = fmt(s, { weekday: 'long', day: 'numeric', month: 'long' }) + ' om ' + hhmm(s);
      function done(meet) {
        bk.els.s2.hidden = true; bk.els.s3.hidden = false;
        bk.els.doneText.textContent = 'Tot ' + when + '. ' + (mode === 'phone' ? 'We bellen je op ' + payload.phone + '.' : 'De uitnodiging met videolink staat in je mail.') +
          (bk.demo ? ' (Voorbeeld: er is niets ingepland.)' : '');
        if (meet) { bk.els.meet.href = meet; bk.els.meet.hidden = false; }
      }
      if (bk.demo) { done(null); return; }

      bk.els.submit.disabled = true; bk.els.submit.textContent = 'Inplannen…';
      postJSON('/api/book', payload).then(function (j) {
        bk.els.submit.disabled = false; bk.els.submit.textContent = 'Bevestig afspraak';
        if (j.ok) return done(j.meet);
        bk.els.note.classList.add('err');
        if (j._status === 409) {
          bk.els.note.textContent = 'Dit moment is net vergeven. Kies een ander tijdstip.';
          setTimeout(function () { bk.els.back.click(); loadSlots(); }, 1600);
        } else {
          bk.els.note.textContent = 'Inplannen lukte niet. Probeer het opnieuw of stuur ons hieronder een bericht.';
        }
      }).catch(function () {
        bk.els.submit.disabled = false; bk.els.submit.textContent = 'Bevestig afspraak';
        bk.els.note.textContent = 'Geen verbinding. Probeer het opnieuw.'; bk.els.note.classList.add('err');
      });
    });
    loadSlots();
  }

  // clear red state as soon as someone types
  document.querySelectorAll('.field input, .field textarea').forEach(function (i) {
    i.addEventListener('input', function () { var f = i.closest('.field'); if (f) f.classList.remove('invalid'); });
  });

  /* ---------- Contact form → /api/contact (lands in the Social Wave inbox) ---------- */
  var form = document.getElementById('form');
  var note = document.getElementById('formNote');
  var submit = document.getElementById('submit');
  var sent = document.getElementById('sent');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    note.textContent = ''; note.classList.remove('err');
    var f = {
      name: document.getElementById('fName'), company: document.getElementById('fCompany'),
      email: document.getElementById('fEmail'), phone: document.getElementById('fPhone'), message: document.getElementById('fMessage')
    };
    var bad = [
      markInvalid(f.name, !f.name.value.trim()),
      markInvalid(f.company, !f.company.value.trim()),
      markInvalid(f.email, !emailOk(f.email.value.trim()))
    ].some(Boolean);
    if (bad) { note.textContent = 'Vul je naam, bedrijf en e-mail in.'; note.classList.add('err'); return; }

    var payload = {
      name: f.name.value.trim(), company: f.company.value.trim(), email: f.email.value.trim(),
      phone: f.phone.value.trim(), message: f.message.value.trim(),
      goals: Array.prototype.map.call(form.querySelectorAll('input[name=goal]:checked'), function (i) { return i.value; }),
      website: document.getElementById('fHp').value
    };
    if (!isLiveHost) { form.hidden = true; sent.hidden = false; return; } // preview: nothing is sent

    submit.disabled = true; submit.textContent = 'Versturen…';
    postJSON('/api/contact', payload).then(function (j) {
      if (j.ok) { form.hidden = true; sent.hidden = false; return; }
      throw new Error(j.error || 'failed');
    }).catch(function () {
      submit.disabled = false; submit.textContent = 'Verstuur bericht';
      note.textContent = 'Versturen lukte niet. Probeer het zo nog eens.';
      note.classList.add('err');
    });
  });

  document.getElementById('year').textContent = new Date().getFullYear();
})();
