// Mail opens for the SW lead engine. The freevid mail and the follow-up show the video thumbnail
// /v/media/<slug>-thumb.jpg; when a mail client loads it, the lead engine gets a "mail_open" signal.
// The image itself is served as before (this only looks, it never changes the response).
// Also: a lead page opened with ?me=1 marks the visitor's network as Jiang's own (views from there never count).
// Not reported: the lead page itself (same-site referer), link previews (WhatsApp, Instagram, iMessage, ...).
// The engine filters the rest: Apple Mail Privacy Protection, security scanners, Jiang's own drafts.
// Also: a shared onboarding (/welkomsformulier?bekijk=<id>) gets its own link preview in WhatsApp, iMessage, ...:
// "Bekijk resultaten <bedrijf>" instead of the form's own title. Only for preview bots; people get the page as it is.

export const config = { matcher: ['/v/:path*', '/welkomsformulier'] };

const ENDPOINT = 'https://urlpudzyeumiunaireeh.supabase.co/functions/v1/lead-signal';
const WELCOME = 'https://urlpudzyeumiunaireeh.supabase.co/functions/v1/os-welcome';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW_BOTS = /bot|crawl|spider|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|linkedin|skype|embedly|pinterest|vkshare|preview|headless|python|curl|wget/i;

function post(context, body) {
  const beacon = fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', origin: 'https://socialwave-agency.nl' },
    body: JSON.stringify(body),
  }).catch(() => {});
  if (context && context.waitUntil) context.waitUntil(beacon);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The link preview of a shared onboarding: a tiny page with only the tags a preview reads. */
async function onboardingPreview(url, id) {
  let company = null;
  try {
    const res = await fetch(`${WELCOME}?id=${id}`);
    if (res.ok) company = (await res.json()).company;
  } catch { /* the preview still works, just without the name */ }
  const title = company ? `Bekijk resultaten ${company}` : 'Bekijk resultaten onboarding';
  const description = company ? `Wat ${company} invulde in de onboarding van Social Wave.` : 'De onboarding van Social Wave.';
  const image = `${url.origin}/site/media/apple-touch-icon.png`;
  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"><meta name="robots" content="noindex">
<meta property="og:type" content="website"><meta property="og:site_name" content="Social Wave">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url.href)}"><meta property="og:image" content="${esc(image)}">
<link rel="apple-touch-icon" href="/site/media/apple-touch-icon.png"></head><body></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export default function middleware(request, context) {
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const h = request.headers;
  if (url.pathname === '/welkomsformulier') {
    const id = url.searchParams.get('bekijk') || '';
    if (UUID.test(id) && PREVIEW_BOTS.test(h.get('user-agent') || '')) return onboardingPreview(url, id);
    return;
  }
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
