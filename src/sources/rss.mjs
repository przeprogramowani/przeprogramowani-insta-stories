import { XMLParser } from 'fast-xml-parser';
import { fetchText } from '../http.mjs';

/** Latest item of an RSS feed (Substack puts the full post in content:encoded). */
export async function latestFromRss({ url }) {
  const text = await fetchText(url, { accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' });
  const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(text);
  const items = [xml.rss?.channel?.item ?? []].flat();
  if (!items.length) throw new Error('Feed has no items');
  const it = items
    .map((i) => ({ ...i, _date: new Date(i.pubDate) }))
    .sort((a, b) => b._date - a._date)[0];
  return {
    id: it.guid?.['#text'] ?? it.guid ?? it.link,
    title: decode(it.title),
    subtitle: decode(it.description ?? ''),
    link: it.link,
    coverUrl: it.enclosure?.url ?? null,
    /** Full issue body as plain text (Substack puts the whole post in content:encoded). */
    text: htmlToText(it['content:encoded'] ?? ''),
    publishedAt: it._date.toISOString(),
  };
}

export function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

export function htmlToText(html) {
  return decode(
    String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
