import sharp from 'sharp';
import { IMAGE_MODEL, STORY, openrouter } from './config.mjs';

/** A fresh text-free 9:16 dark "tech / space" background from the image model, nudged by the issue's topics. */
export async function generateBackground(post, leads, brand) {
  const topics = leads.map((l) => l.title).join('; ');
  const message = await openrouter({
    model: IMAGE_MODEL,
    modalities: ['image', 'text'],
    image_config: { aspect_ratio: '9:16' },
    messages: [
      {
        role: 'user',
        content: [
          'Vertical 9:16 background image (1080x1920) for an Instagram Story of a software-engineering / AI newsletter.',
          `Style: dark, techy deep-space scene — ${brand.backgroundStyle}. Subtle glowing grid lines and circuit-like traces. Clean, modern, premium, slightly abstract. Keep the palette consistent; no off-palette colours.`,
          `Weave in one or two subtle abstract visual motifs inspired by this issue's topics: ${topics}.`,
          'ABSOLUTELY NO text, letters, numbers, logos, watermarks or UI elements anywhere.',
          'Keep the middle of the image calm and low-detail (text cards will be placed on top); put most detail near the edges.',
        ].join('\n'),
      },
    ],
  });
  const url = message.images?.[0]?.image_url?.url;
  if (!url) throw new Error(`Image model returned no image: ${String(message.content).slice(0, 300)}`);
  const raw = url.startsWith('data:')
    ? Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
    : Buffer.from(await (await fetch(url)).arrayBuffer());
  return sharp(raw).resize(STORY.width, STORY.height, { fit: 'cover' }).png().toBuffer();
}
