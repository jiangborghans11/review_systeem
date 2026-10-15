// POST /api/contact → sends the contact form to Social Wave's inbox via Gmail
const { cfg, sendMail, json, readBody, clean, cleanMultiline, isEmail } = require('./_google');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!cfg.ready) return json(res, 503, { error: 'not_configured' });

  const b = await readBody(req);
  if (b.website) return json(res, 200, { ok: true }); // honeypot

  const name = clean(b.name, 120);
  const company = clean(b.company, 160);
  const email = clean(b.email, 200);
  const phone = clean(b.phone, 40);
  const goals = Array.isArray(b.goals) ? b.goals.map(g => clean(g, 60)).slice(0, 8) : [];
  const message = cleanMultiline(b.message, 3000);
  if (!name || !company || !isEmail(email)) return json(res, 400, { error: 'invalid_input' });

  try {
    await sendMail({
      subject: 'Nieuwe aanvraag via de website: ' + company,
      replyTo: email,
      text: [
        'Nieuwe aanvraag via socialwave-agency.nl/website',
        '',
        'Naam: ' + name,
        'Bedrijf: ' + company,
        'E-mail: ' + email,
        'Telefoon: ' + (phone || '-'),
        'Interesse: ' + (goals.join(', ') || '-'),
        '',
        'Bericht:',
        message || '-',
        '',
        'Beantwoord deze mail om direct te reageren.'
      ].join('\n')
    });
    json(res, 200, { ok: true });
  } catch (e) {
    console.error('[contact]', e.message);
    json(res, 502, { error: 'mail_unavailable' });
  }
};
