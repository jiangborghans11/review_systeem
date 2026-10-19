// Mail opens for the SW lead engine. The freevid mail and the follow-up show the video thumbnail
// /v/media/<slug>-thumb.jpg; when a mail client loads it, the lead engine gets a "mail_open" signal.
// The image itself is served as before (this only looks, it never changes the response).
// Also: a lead page opened with ?me=1 marks the visitor's network as Jiang's own (views from there never count).
// Not reported: the lead page itself (same-site referer), link previews (WhatsApp, Instagram, iMessage, ...).
// The engine filters the rest: Apple Mail Privacy Protection, security scanners, Jiang's own drafts.

export const config = { matcher: ['/v/:path*'] };

const ENDPOINT = 'https://urlpudzyeumiunaireeh.supabase.co/functions/v1/lead-signal';
const PREVIEW_BOTS = /bot|crawl|spider|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|linkedin|skype|embedly|pinterest|vkshare|preview|headless|python|curl|wget/i;

function post(context, body) {
  const beacon = fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', origin: 'https://socialwave-agency.nl' },
    body: JSON.stringify(body),
  }).catch(() => {});
  if (context && context.waitUntil) context.waitUntil(beacon);
}

export default function middleware(request, context) {
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const h = request.headers;
  const clientIp = (h.get('x-forwarded-for') || '').split(',')[0].trim();
  if (url.searchParams.get('me') === '1' && /^\/v\/[a-z0-9-]+$/.test(url.pathname)) {
    post(context, { type: 'owner', ip: clientIp });
    return;
  }
  const m = url.pathname.match(/^\/v\/media\/([a-z0-9-]{1,80})-thumb\.jpg$/);
  if (!m) return;
  const ref = h.get('referer') || '';
  if (h.get('sec-fetch-site') === 'same-origin' || /socialwave-agency\.nl|vercel\.app|localhost/.test(ref)) return;
  const ua = h.get('user-agent') || '';
  if (PREVIEW_BOTS.test(ua)) return;
  post(context, { slug: m[1], type: 'mail_open', ua: ua.slice(0, 300), ip: clientIp });
}
