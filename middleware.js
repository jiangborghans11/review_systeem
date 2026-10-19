// Mail opens for the SW lead engine. The freevid mail and the follow-up show the video thumbnail
// /v/media/<slug>-thumb.jpg; when a mail client loads it, the lead engine gets a "mail_open" signal.
// The image itself is served as before (this only looks, it never changes the response).
// Not reported: the lead page itself (same-site referer), link previews (WhatsApp, Instagram, iMessage, ...).
// The engine filters the rest: Apple Mail Privacy Protection, security scanners, Jiang's own drafts.

export const config = { matcher: '/v/media/:file*' };

const ENDPOINT = 'https://urlpudzyeumiunaireeh.supabase.co/functions/v1/lead-signal';
const PREVIEW_BOTS = /bot|crawl|spider|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|linkedin|skype|embedly|pinterest|vkshare|preview|headless|python|curl|wget/i;

export default function middleware(request, context) {
  if (request.method !== 'GET') return;
  const m = new URL(request.url).pathname.match(/^\/v\/media\/([a-z0-9-]{1,80})-thumb\.jpg$/);
  if (!m) return;
  const h = request.headers;
  const ref = h.get('referer') || '';
  if (h.get('sec-fetch-site') === 'same-origin' || /socialwave-agency\.nl|vercel\.app|localhost/.test(ref)) return;
  const ua = h.get('user-agent') || '';
  if (PREVIEW_BOTS.test(ua)) return;
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim();
  const beacon = fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', origin: 'https://socialwave-agency.nl' },
    body: JSON.stringify({ slug: m[1], type: 'mail_open', ua: ua.slice(0, 300), ip }),
  }).catch(() => {});
  if (context && context.waitUntil) context.waitUntil(beacon);
}
