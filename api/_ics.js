// Busy times from published calendars (.ics links), next to Google's freeBusy.
// Used for Jiang's iPhone agenda: in the Agenda app, (i) next to an iCloud calendar → "Openbare agenda" → share the
// link, and put it in Vercel's ICLOUD_ICS_URLS (several links: separated by spaces, commas or new lines).
// Not exposed as a route (Vercel ignores files starting with "_"). No dependencies.
//
// What counts as busy, like Google: a timed event unless it is set to "free" (TRANSP:TRANSPARENT); an all-day event
// only when it is explicitly busy (TRANSP:OPAQUE), because all-day items are "free" by default on the iPhone.
// Cancelled events and cancelled occurrences (EXDATE, a moved occurrence via RECURRENCE-ID) don't count.

const DEFAULT_TZ = 'Europe/Amsterdam';
const DAY_MS = 86400000;
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/* ---------- Time zones (no dependencies) ---------- */
function validTz(tz) {
  if (!tz) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (e) { return null; }
}
function tzOffset(date, tz) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
// Wall-clock time in tz → UTC ms.
function wallToUtc(y, m, d, sec, tz) {
  const guess = Date.UTC(y, m - 1, d) + sec * 1000;
  let t = guess - tzOffset(new Date(guess), tz);
  t = guess - tzOffset(new Date(t), tz);
  return t;
}

/* ---------- Parsing ---------- */
function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}
function parseLine(line) {
  // NAME;PARAM=a;PARAM2="b:c":value  (a colon inside quotes is not the separator)
  let i = 0, q = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ':' && !q) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const parts = head.split(';');
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}

// A date-time value → { y, m, d, sec, allDay, utc, tz }. utc: ends in Z. tz: the TZID (or floating → default).
function parseTime(value, params, defTz) {
  const v = String(value || '').trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const allDay = params.VALUE === 'DATE' || !m[4];
  return {
    y: +m[1], m: +m[2], d: +m[3],
    sec: allDay ? 0 : (+m[4]) * 3600 + (+m[5]) * 60 + (+(m[6] || 0)),
    allDay, utc: !!m[7],
    tz: validTz(params.TZID) || defTz
  };
}
function toMs(t) {
  if (t.utc) return Date.UTC(t.y, t.m - 1, t.d) + t.sec * 1000;
  return wallToUtc(t.y, t.m, t.d, t.sec, t.tz);
}
function parseDuration(v) {
  const m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const s = ((+(m[2] || 0)) * 7 + (+(m[3] || 0))) * 86400 + (+(m[4] || 0)) * 3600 + (+(m[5] || 0)) * 60 + (+(m[6] || 0));
  return (m[1] === '-' ? -1 : 1) * s * 1000;
}
function parseRrule(v) {
  const r = {};
  for (const part of String(v || '').split(';')) {
    const [k, val] = part.split('=');
    if (k && val != null) r[k.toUpperCase()] = val;
  }
  if (!r.FREQ) return null;
  return {
    freq: r.FREQ.toUpperCase(),
    interval: Math.max(1, parseInt(r.INTERVAL, 10) || 1),
    count: r.COUNT ? parseInt(r.COUNT, 10) : null,
    until: r.UNTIL || null,
    byday: r.BYDAY ? r.BYDAY.split(',').map(s => {
      const x = s.trim().toUpperCase().match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
      return x ? { n: x[1] ? parseInt(x[1], 10) : 0, wd: WD[x[2]] } : null;
    }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number).filter(n => n) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number).filter(n => n) : null,
    wkst: WD[(r.WKST || 'MO').toUpperCase()] ?? 1
  };
}

function parseEvents(text, defTz = DEFAULT_TZ) {
  const out = [];
  let ev = null, depth = 0;
  for (const raw of unfold(text)) {
    if (!raw) continue;
    const { name, params, value } = parseLine(raw);
    if (name === 'BEGIN') {
      if (value.toUpperCase() === 'VEVENT' && !ev) { ev = { exdates: [] }; depth = 0; }
      else if (ev) depth++; // VALARM etc. inside the event
      continue;
    }
    if (name === 'END') {
      if (!ev) continue;
      if (depth > 0) { depth--; continue; }
      if (value.toUpperCase() === 'VEVENT') { if (ev.start) out.push(ev); ev = null; }
      continue;
    }
    if (!ev || depth > 0) continue;
    switch (name) {
      case 'UID': ev.uid = value; break;
      case 'DTSTART': ev.start = parseTime(value, params, defTz); break;
      case 'DTEND': ev.end = parseTime(value, params, defTz); break;
      case 'DURATION': ev.duration = parseDuration(value); break;
      case 'RRULE': ev.rrule = parseRrule(value); break;
      case 'EXDATE':
        for (const v of value.split(',')) { const t = parseTime(v, params, defTz); if (t) ev.exdates.push(t); }
        break;
      case 'RECURRENCE-ID': ev.recurrenceId = parseTime(value, params, defTz); break;
      case 'STATUS': ev.status = value.trim().toUpperCase(); break;
      case 'TRANSP': ev.transp = value.trim().toUpperCase(); break;
    }
  }
  return out;
}

/* ---------- Recurrence ---------- */
// Calendar days as a plain day number (UTC midnight / DAY_MS), so wall-clock math ignores DST.
const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
const ymdOf = (n) => { const x = new Date(n * DAY_MS); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()]; };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function nthWeekdayMatch(y, m, d, wd, n) {
  // n > 0: the n-th weekday wd of the month; n < 0: counted from the end. n = 0: every wd.
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== wd) return false;
  if (!n) return true;
  if (n > 0) return Math.ceil(d / 7) === n;
  return Math.ceil((daysInMonth(y, m) - d + 1) / 7) === -n;
}
function monthDayMatch(y, m, d, list) {
  const dim = daysInMonth(y, m);
  return list.some(md => (md > 0 ? md : dim + md + 1) === d);
}

// Does calendar day `n` hold an occurrence of rule r for a series starting on day `n0`?
function ruleMatches(r, n0, n) {
  const [y0, m0, d0] = ymdOf(n0), [y, m, d] = ymdOf(n);
  const wd = new Date(n * DAY_MS).getUTCDay();
  if (r.bymonth && !r.bymonth.includes(m)) return false;
  switch (r.freq) {
    case 'DAILY':
      if ((n - n0) % r.interval) return false;
      if (r.byday && !r.byday.some(b => b.wd === wd)) return false;
      if (r.bymonthday && !monthDayMatch(y, m, d, r.bymonthday)) return false;
      return true;
    case 'WEEKLY': {
      const weekStart = (k) => k - ((new Date(k * DAY_MS).getUTCDay() - r.wkst + 7) % 7);
      const weeks = Math.round((weekStart(n) - weekStart(n0)) / 7);
      if (weeks % r.interval) return false;
      const days = r.byday ? r.byday.map(b => b.wd) : [new Date(n0 * DAY_MS).getUTCDay()];
      return days.includes(wd);
    }
    case 'MONTHLY': {
      const months = (y - y0) * 12 + (m - m0);
      if (months % r.interval) return false;
      if (r.byday) {
        if (!r.byday.some(b => nthWeekdayMatch(y, m, d, b.wd, b.n))) return false;
        return r.bymonthday ? monthDayMatch(y, m, d, r.bymonthday) : true;
      }
      if (r.bymonthday) return monthDayMatch(y, m, d, r.bymonthday);
      return d === d0;
    }
    case 'YEARLY': {
      if ((y - y0) % r.interval) return false;
      const months = r.bymonth || [m0];
      if (!months.includes(m)) return false;
      if (r.byday) return r.byday.some(b => nthWeekdayMatch(y, m, d, b.wd, b.n));
      if (r.bymonthday) return monthDayMatch(y, m, d, r.bymonthday);
      return d === d0;
    }
  }
  return false;
}

// All occurrence starts (UTC ms) of a series that begin before `before`. Occurrences keep the start's wall-clock time
// (so 10:00 stays 10:00 across a DST change). Counts from the series start, so COUNT is exact.
function occurrences(ev, before) {
  const s = ev.start;
  const first = toMs_(s);
  if (!ev.rrule) return first < before ? [first] : [];
  const r = ev.rrule;
  const until = r.until ? (() => {
    const t = parseTime(r.until, {}, s.tz);
    if (!t) return Infinity;
    // A date-only UNTIL includes that whole day.
    return t.allDay ? toMs_({ ...t, allDay: s.allDay, sec: s.allDay ? 0 : 86399, tz: s.tz, utc: false }) : toMs_(t);
  })() : Infinity;
  const n0 = dayNum(s.y, s.m, s.d);
  const out = [];
  let count = 0;
  const last = Math.floor(before / DAY_MS) + 2;
  for (let n = n0; n <= last; n++) {
    if (n !== n0 && !ruleMatches(r, n0, n)) continue;
    const [y, m, d] = ymdOf(n);
    const at = toMs_({ ...s, y, m, d });
    if (at > until || at >= before) break;
    count++;
    if (r.count && count > r.count) break;
    out.push(at);
  }
  return out;
}
// All-day: midnight in the default zone (Jiang's day), like Google.
function toMs_(t) {
  if (t.allDay) return wallToUtc(t.y, t.m, t.d, 0, DEFAULT_TZ);
  return toMs(t);
}

function lengthMs(ev) {
  if (ev.end) return Math.max(0, toMs_(ev.end) - toMs_(ev.start));
  if (ev.duration != null) return Math.max(0, ev.duration);
  return ev.start.allDay ? DAY_MS : 0;
}
// An all-day length in days, so a recurring all-day event stays whole days across DST.
function endOf(ev, startMs) {
  if (ev.start.allDay) {
    const days = Math.max(1, Math.round(lengthMs(ev) / DAY_MS));
    const [y, m, d] = ymdOf(Math.floor((startMs + 12 * 3600000) / DAY_MS));
    return wallToUtc(...ymdOf(dayNum(y, m, d) + days), 0, DEFAULT_TZ);
  }
  return startMs + lengthMs(ev);
}

const isBusy = (ev) => ev.status !== 'CANCELLED' &&
  (ev.start.allDay ? ev.transp === 'OPAQUE' : ev.transp !== 'TRANSPARENT');

/** Busy intervals [[startMs, endMs], ...] from .ics text that overlap [timeMin, timeMax). */
function busyFromIcs(text, timeMin, timeMax, defTz = DEFAULT_TZ) {
  const from = +timeMin, to = +timeMax;
  const events = parseEvents(text, defTz);
  // Moved or edited occurrences: RECURRENCE-ID marks which original occurrence they replace.
  const replaced = new Set();
  for (const ev of events) if (ev.recurrenceId && ev.uid) replaced.add(ev.uid + '|' + toMs_(ev.recurrenceId));
  const out = [];
  for (const ev of events) {
    if (!ev.start) continue;
    if (ev.recurrenceId) {
      if (!isBusy(ev)) continue;
      const s = toMs_(ev.start), e = endOf(ev, s);
      if (s < to && e > from) out.push([s, e]);
      continue;
    }
    if (!isBusy(ev)) continue;
    const ex = new Set(ev.exdates.map(toMs_));
    const exDays = new Set(ev.exdates.filter(t => t.allDay).map(t => dayNum(t.y, t.m, t.d)));
    for (const s of occurrences(ev, to)) {
      if (ex.has(s) || replaced.has(ev.uid + '|' + s)) continue;
      if (exDays.size) {
        const p = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s));
        if (exDays.has(dayNum(+p.slice(0, 4), +p.slice(5, 7), +p.slice(8, 10)))) continue;
      }
      const e = endOf(ev, s);
      if (e > from) out.push([s, e]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/* ---------- Fetching ---------- */
function icsUrls(env = process.env.ICLOUD_ICS_URLS) {
  return String(env || '').split(/[\s,]+/).filter(Boolean).map(u => u.replace(/^webcal:\/\//i, 'https://'));
}

async function fetchIcs(url, timeoutMs = 5000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { Accept: 'text/calendar' }, signal: ac.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('no calendar');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busy intervals from every published calendar in ICLOUD_ICS_URLS. A link that can't be read is logged and skipped:
 * the planner keeps working on Google alone rather than showing "agenda niet bereikbaar" to leads.
 */
async function getIcsBusy(timeMin, timeMax, urls = icsUrls(), log = console.error) {
  const texts = await Promise.all(urls.map(u => fetchIcs(u).catch(e => {
    log('[ics] ' + u.replace(/^(https:\/\/[^/]+).*/, '$1') + ': ' + e.message);
    return '';
  })));
  return texts.flatMap(t => (t ? busyFromIcs(t, timeMin, timeMax) : []));
}

module.exports = { busyFromIcs, parseEvents, getIcsBusy, icsUrls };
