// Feed relay: GitHub Actions runners get a Cloudflare "Just a moment…" challenge from Substack,
// so the Story pipeline reads newsletter feeds through this Worker instead.
// Only allow-listed feeds are relayed — this is not an open proxy — and only for callers holding the
// shared RELAY_TOKEN secret, so others can't burn the Worker's request quota.
const FEEDS = {
  przeprogramowani: 'https://przeprogramowani.substack.com/feed.xml',
};

const CACHE_SECONDS = 3600;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    // Unauthorized callers get the same 404 as unknown paths — nothing to probe.
    if (!authorized(request, env)) return new Response('Not found', { status: 404 });

    // GET /feeds/<key>.xml
    const match = new URL(request.url).pathname.match(/^\/feeds\/([a-z0-9-]+)\.xml$/);
    const upstream = match && FEEDS[match[1]];
    if (!upstream) return new Response('Not found', { status: 404 });

    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).toString());
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const res = await fetch(upstream, {
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8', 'User-Agent': 'przeprogramowani-feed-relay/1.0' },
    });
    if (!res.ok) return new Response(`Upstream ${res.status}`, { status: 502 });

    const relayed = new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/rss+xml; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, relayed.clone()));
    return relayed;
  },
};

function authorized(request, env) {
  if (!env.RELAY_TOKEN) return false;
  const enc = new TextEncoder();
  const got = enc.encode(request.headers.get('Authorization') ?? '');
  const want = enc.encode(`Bearer ${env.RELAY_TOKEN}`);
  return got.byteLength === want.byteLength && crypto.subtle.timingSafeEqual(got, want);
}
