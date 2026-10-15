import sharp from 'sharp';
import { writeLeads } from './leads.mjs';
import { generateBackground } from './background.mjs';
import { composeStory } from './layout.mjs';
import { issueCache } from './cache.mjs';

/** Full Story: AI leads + AI background (both cached per issue) + template layout → 1080x1920 JPEG (Instagram accepts JPEG only). */
export async function renderStory(post, newsletter) {
  const cache = issueCache(newsletter.key, post.id);
  const leads = await cache.json('leads.json', () => writeLeads(post, newsletter));
  console.log('Leads:\n' + leads.map((l, i) => `  ${i + 1}. ${l.title} — ${l.text}`).join('\n'));
  const background = await cache.buffer('background.png', () => generateBackground(post, leads));
  const png = await composeStory(background, leads, newsletter.brand);
  return { jpg: await sharp(png).jpeg({ quality: 92 }).toBuffer(), leads };
}
