import { latestFromRss, htmlToText } from './rss.mjs';
import { fetchJson } from '../http.mjs';

/**
 * Latest Substack post: RSS first, Substack's JSON API as a fallback (they're served by different
 * routes, so one may pass when the other is challenged). Same output shape as other sources.
 */
export async function latestFromSubstack({ host }) {
  try {
    return await latestFromRss({ url: `https://${host}/feed.xml` });
  } catch (rssError) {
    console.warn(`RSS failed (${rssError.message}); trying the Substack API`);
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
}
