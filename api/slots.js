// GET /api/slots → bookable 15-minute intake slots (Mon–Fri 09:00–18:00, Europe/Amsterdam)
const { cfg, availability, json } = require('./_google');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (!cfg.ready) return json(res, 503, { error: 'not_configured' });
  try {
    const days = await availability(new Date());
    json(res, 200, { timezone: cfg.tz, duration: cfg.duration, days });
  } catch (e) {
    console.error('[slots]', e.message);
    json(res, 502, { error: 'calendar_unavailable' });
  }
};
