import { latestFromRss, htmlToText } from './rss.mjs';
import { fetchJson } from '../http.mjs';

/**
 * Latest Substack post. Substack challenges GitHub Actions IPs, so try in order:
 * our Cloudflare relay (relay/), the feed directly, then Substack's JSON API.
 * Same output shape as other sources.
 */
export async function latestFromSubstack({ host, relayUrl }) {
  for (const url of [relayUrl, `https://${host}/feed.xml`].filter(Boolean)) {
    try {
      return await latestFromRss({ url });
    } catch (e) {
      console.warn(`Feed failed (${e.message})`);
    }
  }
  console.warn('Trying the Substack API');
  const [latest] = await fetchJson(`https://${host}/api/v1/archive?sort=new&limit=1`);
  if (!latest) throw new Error(`Substack API returned no posts for ${host}`);
  const post = await fetchJson(`https://${host}/api/v1/posts/${latest.slug}`);
  return {
    id: post.canonical_url, // same value RSS uses as guid/link, so dedupe works across both paths
    title: post.title,
    subtitle: post.subtitle ?? '',
    link: post.canonical_url,
    coverUrl: post.cover_image ?? null,
    text: htmlToText(post.body_html ?? ''),
    publishedAt: new Date(post.post_date).toISOString(),
  };
}
