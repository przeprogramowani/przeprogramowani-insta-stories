# Feed relay (Cloudflare Worker)

Substack serves a Cloudflare challenge to GitHub Actions IPs, so the pipeline fetches feeds via this
Worker: `GET /feeds/<key>.xml` → allow-listed upstream feed, cached for 1 hour.

Deploy (Cloudflare account <private>):

```bash
cd relay && npx wrangler@latest deploy
```

Add a feed: extend `FEEDS` in `src/index.js`, redeploy, then point the newsletter's source at
`https://<worker-url>/feeds/<key>.xml` in `src/newsletters.mjs`.
