import sharp from 'sharp';
import { writeLeads } from './leads.mjs';
import { generateBackground } from './background.mjs';
import { composeStory } from './layout.mjs';
import { createHash } from 'node:crypto';
import { issueCache } from './cache.mjs';

/** Full Story: AI leads + AI background (both cached per issue) + template layout → 1080x1920 JPEG (Instagram accepts JPEG only). */
export async function renderStory(post, newsletter) {
  const cache = issueCache(newsletter.key, post.id);
  const leads = await cache.json('leads.json', () => writeLeads(post, newsletter));
  console.log('Leads:\n' + leads.map((l, i) => `  ${i + 1}. ${l.title} — ${l.text}`).join('\n'));
  // Keyed by the brand's background style, so a palette change regenerates instead of reusing.
  const style = createHash('sha1').update(newsletter.brand.backgroundStyle).digest('hex').slice(0, 8);
  const background = await cache.buffer(`background-${style}.png`, () => generateBackground(post, leads, newsletter.brand));
  const png = await composeStory(background, leads, newsletter.brand);
  return { jpg: await sharp(png).jpeg({ quality: 92 }).toBuffer(), leads };
}
