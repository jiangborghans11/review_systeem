// POST /api/book → creates the intake in Google Calendar and invites the guest
const crypto = require('crypto');
const {
  cfg, availability, gapi, sendMail, json, readBody, clean, cleanMultiline, isEmail
} = require('./_google');

const fmt = (d, opts) => new Intl.DateTimeFormat('nl-NL', Object.assign({ timeZone: cfg.tz }, opts)).format(d);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!cfg.ready) return json(res, 503, { error: 'not_configured' });

  const b = await readBody(req);
  if (b.hp) return json(res, 200, { ok: true }); // honeypot

  const name = clean(b.name, 120);
  const company = clean(b.company, 160);
  const email = clean(b.email, 200);
  const site = clean(b.site, 200);
  const phone = clean(b.phone, 40);
  const note = cleanMultiline(b.note, 2000);
  const start = new Date(b.start);

  if (!name || !company || !isEmail(email) || isNaN(start)) return json(res, 400, { error: 'invalid_input' });
  if (phone.replace(/[^0-9]/g, '').length < 8) return json(res, 400, { error: 'phone_required' });

  try {
    // Re-check that the slot is still free right now
    const days = await availability(new Date());
    const iso = start.toISOString();
    const stillFree = days.some(d => d.slots.includes(iso));
    if (!stillFree) return json(res, 409, { error: 'slot_taken' });

    const end = new Date(start.getTime() + cfg.duration * 60000);
    const description = [
      'Kennismaking van 15 minuten met Social Wave.',
      '',
      'Naam: ' + name,
      'Bedrijf: ' + company,
      'Website: ' + (site || '-'),
      'E-mail: ' + email,
      'Telefoon: ' + phone,
      '',
      'Extra info over het bedrijf:',
      note || '-'
    ].join('\n');

    const event = {
      summary: 'Kennismaking Social Wave × ' + company,
      description,
      start: { dateTime: start.toISOString(), timeZone: cfg.tz },
      end: { dateTime: end.toISOString(), timeZone: cfg.tz },
      attendees: [{ email, displayName: name }],
      reminders: { useDefault: true },
      guestsCanModify: false,
      guestsCanInviteOthers: false
    };
    event.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };

    const created = await gapi('POST',
      'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(cfg.calendarId) +
      '/events?conferenceDataVersion=1&sendUpdates=all', event);

    const when = fmt(start, { weekday: 'long', day: 'numeric', month: 'long' }) + ' om ' + fmt(start, { hour: '2-digit', minute: '2-digit' });

    // Heads-up for Jiang (non-blocking)
    try {
      await sendMail({
        subject: 'Nieuwe kennismaking: ' + company + ' (' + when + ')',
        replyTo: email,
        text: 'Er is een kennismaking ingepland via socialwave-agency.nl.\n\nWanneer: ' + when + '\n\n' + description +
          (created.hangoutLink ? '\n\nMeet: ' + created.hangoutLink : '') + '\n\nAgenda: ' + (created.htmlLink || '')
      });
    } catch (e) { console.error('[book] notify', e.message); }

    json(res, 200, {
      ok: true,
      start: start.toISOString(),
      end: end.toISOString(),
      meet: created.hangoutLink || null
    });
  } catch (e) {
    console.error('[book]', e.message);
    json(res, 502, { error: 'calendar_unavailable' });
  }
};
