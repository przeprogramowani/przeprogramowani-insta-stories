import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { STORY } from './config.mjs';
import { composeCustom } from './layout.mjs';

const LOGO_HEIGHT = 72;

/** Ad-hoc Story from a thumbnail (local path or http URL) and a caption → 1080x1920 JPEG. No AI calls. */
export async function renderCustom(input, caption, brand) {
  const raw = /^https?:\/\//.test(input)
    ? Buffer.from(await (await fetch(input)).arrayBuffer())
    : readFileSync(input);
  const png = await sharp(raw).rotate().png().toBuffer();
  const { width, height } = await sharp(png).metadata();
  // Background: the same picture, cropped to 9:16, blurred and darkened so the card and caption stand out.
  const background = await sharp(png)
    .resize(STORY.width, STORY.height, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 0.45 })
    .png()
    .toBuffer();
  // The source wordmark is small (313×46); upscale once with Lanczos rather than letting resvg stretch it.
  const logo = brand.logo && (await sharp(brand.logo).resize({ height: LOGO_HEIGHT, kernel: 'lanczos3' }).png().toBuffer({ resolveWithObject: true }));
  const story = await composeCustom(background, { png, width, height }, caption, brand, logo && { png: logo.data, width: logo.info.width, height: logo.info.height });
  return sharp(story).jpeg({ quality: 92 }).toBuffer();
}
