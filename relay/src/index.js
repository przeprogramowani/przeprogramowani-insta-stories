// Feed relay: GitHub Actions runners get a Cloudflare "Just a moment…" challenge from Substack,
// so the Story pipeline reads newsletter feeds through this Worker instead.
// Only allow-listed feeds are relayed — this is not an open proxy.
const FEEDS = {
  przeprogramowani: 'https://przeprogramowani.substack.com/feed.xml',
};

const CACHE_SECONDS = 3600;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

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
