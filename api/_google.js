// Shared helpers for the booking + contact functions.
// Not exposed as a route (Vercel ignores files starting with "_").

const cfg = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  calendarId: process.env.CALENDAR_ID || 'primary',
  notifyEmail: process.env.NOTIFY_EMAIL || 'socialwaveagency.nl@gmail.com',
  holidayCalendar: 'nl.dutch#holiday@group.v.calendar.google.com',
  tz: 'Europe/Amsterdam',

  // Availability rules
  duration: 15,            // minutes per intake
  step: 15,                // slot grid in minutes
  dayStart: 9 * 60,        // 09:00
  dayEnd: 18 * 60,         // 18:00 (last slot ends here)
  weekdays: [1, 2, 3, 4, 5], // Mon–Fri
  minNoticeMin: 180,       // earliest booking: 3 hours from now
  horizonDays: 28,         // how far ahead people can book
  bufferMin: 0             // free minutes around existing events
};
cfg.ready = Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);

let cachedToken = null;
async function getAccessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('token: ' + (j.error_description || j.error || r.status));
  cachedToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function gapi(method, url, body) {
  const token = await getAccessToken();
  const r = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(method + ' ' + url.split('?')[0] + ' → ' + r.status + ' ' + (data.error && data.error.message || ''));
  return data;
}

/* ---------- Time zone helpers (no dependencies) ---------- */
// Offset in ms of `tz` at a given UTC instant.
function tzOffset(date, tz = cfg.tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
// Wall-clock time in `tz` → UTC Date.
function zonedToUtc(y, m, d, minutes, tz = cfg.tz) {
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let t = guess - tzOffset(new Date(guess), tz);
  t = guess - tzOffset(new Date(t), tz); // settle DST edges
  return new Date(t);
}
// UTC instant → { y, m, d, minutes, weekday } in `tz`.
function utcToZoned(date, tz = cfg.tz) {
  const local = new Date(date.getTime() + tzOffset(date, tz));
  return {
    y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay()
  };
}
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/* ---------- Availability ---------- */
async function getBusy(timeMin, timeMax) {
  const fb = await gapi('POST', 'https://www.googleapis.com/calendar/v3/freeBusy', {
    timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), timeZone: cfg.tz,
    items: [{ id: cfg.calendarId }]
  });
  const cal = fb.calendars && (fb.calendars[cfg.calendarId] || Object.values(fb.calendars)[0]);
  if (cal && cal.errors && cal.errors.length) throw new Error('freeBusy: ' + cal.errors[0].reason);
  return (cal && cal.busy || []).map(b => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
}

async function getHolidays(timeMin, timeMax) {
  try {
    const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(cfg.holidayCalendar) +
      '/events?singleEvents=true&maxResults=50&timeMin=' + encodeURIComponent(timeMin.toISOString()) +
      '&timeMax=' + encodeURIComponent(timeMax.toISOString());
    const j = await gapi('GET', url);
    // Only official days off (skip observances like Sinterklaas)
    return new Set((j.items || [])
      .filter(e => e.start && e.start.date && !/observance|viering|herdenking/i.test(e.description || ''))
      .map(e => e.start.date));
  } catch (e) {
    return new Set();
  }
}

// Pure function: builds the bookable slots. Exported for testing.
function computeSlots({ now, busy, holidays, rules = cfg }) {
  const earliest = now.getTime() + rules.minNoticeMin * 60000;
  const pad = rules.bufferMin * 60000;
  const today = utcToZoned(now);
  const days = [];
  for (let i = 0; i <= rules.horizonDays; i++) {
    const cal = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const y = cal.getUTCFullYear(), m = cal.getUTCMonth() + 1, d = cal.getUTCDate();
    if (!rules.weekdays.includes(cal.getUTCDay())) continue;
    const date = ymd(y, m, d);
    const slots = [];
    if (!holidays.has(date)) {
      for (let min = rules.dayStart; min + rules.duration <= rules.dayEnd; min += rules.step) {
        const s = zonedToUtc(y, m, d, min).getTime();
        const e = s + rules.duration * 60000;
        if (s < earliest) continue;
        if (busy.some(([bs, be]) => s < be + pad && e > bs - pad)) continue;
        slots.push(new Date(s).toISOString());
      }
    }
    days.push({ date, slots });
  }
  return days;
}

async function availability(now = new Date()) {
  const today = utcToZoned(now);
  const timeMin = now;
  const end = new Date(Date.UTC(today.y, today.m - 1, today.d + cfg.horizonDays + 1));
  const timeMax = zonedToUtc(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), 0);
  const [busy, holidays] = await Promise.all([getBusy(timeMin, timeMax), getHolidays(timeMin, timeMax)]);
  return computeSlots({ now, busy, holidays });
}

/* ---------- Mail (Gmail API) ---------- */
function encodeHeader(s) { return '=?UTF-8?B?' + Buffer.from(String(s), 'utf8').toString('base64') + '?='; }
async function sendMail({ to = cfg.notifyEmail, subject, text, replyTo }) {
  const lines = [
    'To: ' + to,
    'Subject: ' + encodeHeader(subject),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64'
  ];
  if (replyTo) lines.splice(1, 0, 'Reply-To: ' + replyTo);
  const raw = lines.join('\r\n') + '\r\n\r\n' + Buffer.from(text, 'utf8').toString('base64');
  return gapi('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    raw: Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  });
}

/* ---------- HTTP helpers ---------- */
function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}
function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 2e4) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve({}); } });
  });
}
const clean = (v, max = 500) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const cleanMultiline = (v, max = 3000) => String(v == null ? '' : v).trim().slice(0, max);
const isEmail = (v) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v);

module.exports = {
  cfg, getAccessToken, gapi, availability, computeSlots, getBusy, getHolidays,
  zonedToUtc, utcToZoned, sendMail, json, readBody, clean, cleanMultiline, isEmail, ymd
};
