import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { STORY } from './config.mjs';
import { composeCustom } from './layout.mjs';

const LOGO_HEIGHT = 72;

const osa = (...lines) => execFileSync('osascript', lines.flatMap((l) => ['-e', l]), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * Save the macOS clipboard's image as stories/custom/clipboard-<hash>.png and return that path, so the
 * dry run and the real run read the same file even if the clipboard changes in between. A file copied in
 * Finder wins over the clipboard's picture data (which is then just the file's icon).
 */
export async function saveClipboardImage() {
  let raw;
  try {
    raw = readFileSync(osa('POSIX path of (the clipboard as «class furl»)'));
  } catch {
    const tmp = `stories/custom/.clipboard-${process.pid}`;
    mkdirSync('stories/custom', { recursive: true });
    for (const cls of ['«class PNGf»', 'JPEG picture', 'TIFF picture']) {
      try {
        osa(`set f to open for access POSIX file "${process.cwd()}/${tmp}" with write permission`, 'set eof f to 0', `write (the clipboard as ${cls}) to f`, 'close access f');
        raw = readFileSync(tmp);
        break;
      } catch {
        try { osa(`close access POSIX file "${process.cwd()}/${tmp}"`); } catch {}
      }
    }
    rmSync(tmp, { force: true });
  }
  if (!raw?.length) throw new Error('No image on the clipboard (copy an image or an image file first)');
  const file = `stories/custom/clipboard-${createHash('sha1').update(raw).digest('hex').slice(0, 8)}.png`;
  writeFileSync(file, await sharp(raw).png().toBuffer());
  return file;
}

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
