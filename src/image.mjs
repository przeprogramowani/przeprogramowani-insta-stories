import sharp from 'sharp';
import { writeLeads } from './leads.mjs';
import { generateBackground } from './background.mjs';
import { composeStory } from './layout.mjs';

/** Full Story: AI leads + AI background + template layout → 1080x1920 JPEG (Instagram accepts JPEG only). */
export async function renderStory(post, newsletter) {
  const leads = await writeLeads(post, newsletter);
  console.log('Leads:\n' + leads.map((l, i) => `  ${i + 1}. ${l.title} — ${l.text}`).join('\n'));
  const background = await generateBackground(post, leads);
  const png = await composeStory(background, leads, newsletter.brand);
  return { jpg: await sharp(png).jpeg({ quality: 92 }).toBuffer(), leads };
}
