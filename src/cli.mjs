// Usage (newsletter: przeprogramowani | opanuj-ai):
//   node src/cli.mjs generate <newsletter>        → stories/<newsletter>/<date>-<slug>.jpg (+ .pending.json)
//   node src/cli.mjs upload <newsletter>          → uploads the pending image to S3, prints its CDN URL
//   node src/cli.mjs publish <newsletter> [url]   → posts the pending image (uploaded, or served at <url>) as a Story
//   node src/cli.mjs custom <newsletter> <image|clipboard> "<caption>"
//                                                 → renders an ad-hoc Story (no AI), uploads it to S3, posts it
//   node src/cli.mjs reel <newsletter> <video> "<caption>" [cover image]
//                                                 → checks/remuxes the video, uploads it to S3, posts it as a Reel
// Env: FORCE=1 regenerates even if the latest issue already had a Story. DRY_RUN=1 makes `custom` render only and `reel` prepare only.
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { getNewsletter } from './newsletters.mjs';
import { renderStory } from './image.mjs';
import { publishStory, publishReel, permalink } from './instagram.mjs';
import { prepareReel, prepareCover } from './reel.mjs';
import { renderCustom, saveClipboardImage } from './custom.mjs';
import { hostOnS3 } from './hosting.mjs';

const STATE = 'published.json';
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const saveState = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');

/** Expose values to later GitHub Actions steps. */
const output = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

const slug = (s) =>
  s.replace(/ł/g, 'l').replace(/Ł/g, 'L').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-|-$/g, '');

const pendingPath = (nl) => `stories/${nl.key}/.pending.json`;

async function generate(nl) {
  const post = await nl.latest();
  console.log(`[${nl.key}] Latest issue: ${post.title} (${post.publishedAt.slice(0, 10)})`);
  if ((state[nl.key] ?? []).some((p) => p.id === post.id) && !process.env.FORCE) {
    console.log('Already published as a Story — nothing to do (set FORCE=1 to override).');
    output('skip', 'true');
    return;
  }
  const { jpg, leads } = await renderStory(post, nl);
  mkdirSync(`stories/${nl.key}`, { recursive: true });
  const file = `stories/${nl.key}/${new Date().toISOString().slice(0, 10)}-${slug(post.title)}.jpg`;
  writeFileSync(file, jpg);
  writeFileSync(pendingPath(nl), JSON.stringify({ id: post.id, title: post.title, link: post.link, leads, file }, null, 2));
  console.log(`Wrote ${file}`);
  output('skip', 'false');
  output('file', file);
}

/** Instagram only fetches public URLs: put the pending image on S3/CloudFront and remember the URL. */
async function upload(nl) {
  const pending = JSON.parse(readFileSync(pendingPath(nl), 'utf8'));
  pending.url = await hostOnS3(pending.file, `insta-stories/${nl.key}`);
  writeFileSync(pendingPath(nl), JSON.stringify(pending, null, 2));
  console.log(`Uploaded ${pending.url}`);
  output('url', pending.url);
}

async function publish(nl, url) {
  const pending = JSON.parse(readFileSync(pendingPath(nl), 'utf8'));
  url ??= pending.url;
  if (!url) throw new Error('Nothing uploaded yet — run `upload` first or pass the public URL of the image');
  const mediaId = await publishStory(url, nl.instagramUserIdEnv);
  (state[nl.key] ??= []).push({ id: pending.id, title: pending.title, url, leads: pending.leads, mediaId, at: new Date().toISOString() });
  saveState();
  console.log(`[${nl.key}] Published Story ${mediaId} for "${pending.title}"`);
}

/** Local, immediate Story: thumbnail + caption, posted with the newsletter's brand colours and IG account. */
async function custom(nl, image, caption) {
  if (!image || !caption) throw new Error('custom needs an image (path, URL or `clipboard`) and a caption');
  caption = caption.replace(/\\n/g, '\n').trim();
  if (caption.length > 280) throw new Error(`Caption is ${caption.length} chars — keep it under 280 so it fits below the image`);
  mkdirSync('stories/custom', { recursive: true });
  if (image === 'clipboard') {
    image = await saveClipboardImage();
    console.log(`Clipboard image saved to ${image} (pass this path when posting)`);
  }
  const file = `stories/custom/${new Date().toISOString().slice(0, 10)}-${slug(caption)}.jpg`;
  writeFileSync(file, await renderCustom(image, caption, nl.brand));
  console.log(`Wrote ${file}`);
  if (process.env.DRY_RUN) return;
  const url = await hostOnS3(file);
  const mediaId = await publishStory(url, nl.instagramUserIdEnv);
  console.log(`[${nl.key}] Published Story ${mediaId} (${url})`);
}

/** Post a local video as a Reel with the given caption (and optional cover image). Not recorded in published.json. */
async function reel(nl, video, caption, cover) {
  if (!video || !caption) throw new Error('reel needs a video file and a caption');
  caption = caption.replace(/\\n/g, '\n').trim();
  if (caption.length > 2200) throw new Error(`Caption is ${caption.length} chars — Instagram allows 2200`);
  if ((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > 30) throw new Error('Instagram allows at most 30 hashtags');
  const { file, info, warnings } = prepareReel(video);
  console.log(`Wrote ${file}: ${info.width}×${info.height}, ${info.duration.toFixed(1)} s, ${info.fps.toFixed(0)} fps, ${info.video}/${info.audio ?? 'no audio'}, ${info.sizeMb.toFixed(1)} MB${info.reencoded ? ' (re-encoded)' : ''}`);
  for (const w of warnings) console.log(`Warning: ${w}`);
  const coverFile = cover && (await prepareCover(cover, file));
  if (coverFile) console.log(`Wrote ${coverFile}`);
  if (process.env.DRY_RUN) return;
  const url = await hostOnS3(file, 'insta-stories/reels');
  const coverUrl = coverFile && (await hostOnS3(coverFile, 'insta-stories/reels'));
  console.log(`Uploaded ${url} — waiting for Instagram to process the video…`);
  const mediaId = await publishReel(url, caption, { instagramUserIdEnv: nl.instagramUserIdEnv, coverUrl });
  console.log(`[${nl.key}] Published Reel ${mediaId} ${await permalink(mediaId).catch(() => '')}`);
}

const [cmd, key, arg, arg2, arg3] = process.argv.slice(2);
try {
  const nl = getNewsletter(key);
  if (cmd === 'generate') await generate(nl);
  else if (cmd === 'upload') await upload(nl);
  else if (cmd === 'publish') await publish(nl, arg);
  else if (cmd === 'custom') await custom(nl, arg, arg2);
  else if (cmd === 'reel') await reel(nl, arg, arg2, arg3);
  else throw new Error('Usage: node src/cli.mjs generate <newsletter> | upload <newsletter> | publish <newsletter> [url] | custom <newsletter> <image|clipboard> "<caption>" | reel <newsletter> <video> "<caption>" [cover]');
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
