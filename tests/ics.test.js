// node --test tests/   (no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const { busyFromIcs } = require('../api/_ics');
const { computeSlots } = require('../api/_google');

const AMS = 'TZID=Europe/Amsterdam';
const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//iPhone OS 26//EN',
  'BEGIN:VTIMEZONE', 'TZID:Europe/Amsterdam', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200',
  'DTSTART:19810329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'END:VTIMEZONE',
  ...events.flatMap(e => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const W = [new Date('2026-11-23T00:00:00Z'), new Date('2026-12-15T00:00:00Z')];
const iso = (pairs) => pairs.map(([s, e]) => [new Date(s).toISOString(), new Date(e).toISOString()]);

test('a timed event is busy, in its own time zone', () => {
  const b = busyFromIcs(cal(['UID:a', `DTSTART;${AMS}:20261124T103000`, `DTEND;${AMS}:20261124T113000`, 'SUMMARY:Tandarts']), ...W);
  assert.deepEqual(iso(b), [['2026-11-24T09:30:00.000Z', '2026-11-24T10:30:00.000Z']]);
});

test('free, cancelled and plain all-day events are not busy; a busy all-day event is', () => {
  const b = busyFromIcs(cal(
    ['UID:f', `DTSTART;${AMS}:20261124T100000`, `DTEND;${AMS}:20261124T110000`, 'TRANSP:TRANSPARENT'],
    ['UID:c', `DTSTART;${AMS}:20261124T120000`, `DTEND;${AMS}:20261124T130000`, 'STATUS:CANCELLED'],
    ['UID:d', 'DTSTART;VALUE=DATE:20261125', 'DTEND;VALUE=DATE:20261126', 'TRANSP:TRANSPARENT'],
    ['UID:d2', 'DTSTART;VALUE=DATE:20261126', 'DTEND;VALUE=DATE:20261127'],
    ['UID:v', 'DTSTART;VALUE=DATE:20261127', 'DTEND;VALUE=DATE:20261128', 'TRANSP:OPAQUE', 'SUMMARY:Vrij']
  ), ...W);
  assert.deepEqual(iso(b), [['2026-11-26T23:00:00.000Z', '2026-11-27T23:00:00.000Z']]);
});

test('weekly series started long ago, with an EXDATE and a moved occurrence', () => {
  const b = busyFromIcs(cal(
    ['UID:w', `DTSTART;${AMS}:20240101T140000`, `DTEND;${AMS}:20240101T150000`, 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
      `EXDATE;${AMS}:20261125T140000`],
    ['UID:w', `RECURRENCE-ID;${AMS}:20261130T140000`, `DTSTART;${AMS}:20261130T160000`, `DTEND;${AMS}:20261130T170000`]
  ), new Date('2026-11-23T00:00:00Z'), new Date('2026-12-03T00:00:00Z'));
  assert.deepEqual(iso(b), [
    ['2026-11-23T13:00:00.000Z', '2026-11-23T14:00:00.000Z'], // Mon 23
    // Wed 25 excluded
    ['2026-11-30T15:00:00.000Z', '2026-11-30T16:00:00.000Z'], // Mon 30 moved to 16:00
    ['2026-12-02T13:00:00.000Z', '2026-12-02T14:00:00.000Z']  // Wed 2
  ]);
});

test('series keep their wall-clock time across DST, and respect COUNT, UNTIL and INTERVAL', () => {
  const b = busyFromIcs(cal(
    ['UID:d', `DTSTART;${AMS}:20261020T090000`, 'DURATION:PT30M', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'],
    ['UID:c', `DTSTART;${AMS}:20261123T080000`, `DTEND;${AMS}:20261123T081500`, 'RRULE:FREQ=DAILY;COUNT=2'],
    ['UID:u', `DTSTART;${AMS}:20261201T170000`, `DTEND;${AMS}:20261201T173000`, 'RRULE:FREQ=DAILY;UNTIL=20261202T225959Z']
  ), new Date('2026-11-23T00:00:00Z'), new Date('2026-12-05T00:00:00Z'));
  assert.deepEqual(iso(b), [
    ['2026-11-23T07:00:00.000Z', '2026-11-23T07:15:00.000Z'],
    ['2026-11-24T07:00:00.000Z', '2026-11-24T07:15:00.000Z'],
    ['2026-12-01T08:00:00.000Z', '2026-12-01T08:30:00.000Z'], // every other Tue since 20 Oct (summer time) → 09:00 winter
    ['2026-12-01T16:00:00.000Z', '2026-12-01T16:30:00.000Z'],
    ['2026-12-02T16:00:00.000Z', '2026-12-02T16:30:00.000Z']
  ]);
});

test('monthly by weekday, monthly by day, UTC times, folded lines and alarms', () => {
  const b = busyFromIcs(cal(
    ['UID:m', `DTSTART;${AMS}:20260106T100000`, `DTEND;${AMS}:20260106T110000`, 'RRULE:FREQ=MONTHLY;BYDAY=1TU',
      'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'END:VALARM'],
    ['UID:l', `DTSTART;${AMS}:20260130T150000`, `DTEND;${AMS}:20260130T160000`, 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'],
    ['UID:z', 'DTSTART:20261203T120000Z', 'DTEND:20261203T13', ' 0000Z', 'SUMMARY:Lunch']
  ), new Date('2026-11-23T00:00:00Z'), new Date('2026-12-05T00:00:00Z'));
  assert.deepEqual(iso(b), [
    ['2026-11-30T14:00:00.000Z', '2026-11-30T15:00:00.000Z'], // last day of November
    ['2026-12-01T09:00:00.000Z', '2026-12-01T10:00:00.000Z'], // first Tuesday of December
    ['2026-12-03T12:00:00.000Z', '2026-12-03T13:00:00.000Z']
  ]);
});

test('the planner offers no slot that overlaps an iPhone appointment', () => {
  const busy = busyFromIcs(cal(['UID:a', `DTSTART;${AMS}:20261124T100000`, `DTEND;${AMS}:20261124T113000`]), ...W);
  const days = computeSlots({ now: new Date('2026-11-23T08:00:00Z'), busy, holidays: new Set() });
  const tue = days.find(d => d.date === '2026-11-24').slots.map(s => s.slice(11, 16));
  assert.ok(tue.includes('08:45') && tue.includes('10:30')); // 09:45 and 11:30 local are free
  for (const t of ['09:00', '09:15', '10:00', '10:15']) assert.ok(!tue.includes(t), t);
});
