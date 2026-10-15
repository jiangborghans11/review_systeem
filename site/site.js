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
  function postJSON(url, data) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }
  function markInvalid(input, bad) { input.closest('.field').classList.toggle('invalid', bad); return bad; }
  var emailOk = function (v) { return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v); };
  // Demo data only on preview hosts (never on the real domain)
  var isLiveHost = /socialwave-agency\.nl$|vercel\.app$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);

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
      hp: document.getElementById('fHp').value
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
