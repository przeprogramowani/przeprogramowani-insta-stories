import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { copyProblems, ROLES, writeCarousel } from './carousel-copy.mjs';
import { composeSlide } from './carousel-layout.mjs';
import { hostOnS3 } from './hosting.mjs';
import { audioInfo, containerStatus, createReelDraft, publishDraft } from './instagram.mjs';
import { loadLongform } from './longform.mjs';
import { renderBackgrounds } from './procgen.mjs';

const CONTAINER_TTL_MS = 24 * 3600 * 1000;
const HEADER_LOGO_HEIGHT = 34; // For a one-line wordmark; scaled up with brand.logoHeight for stacked ones.
const FADE_S = 0.5;
const FPS = 30;
const WORDS_PER_S = 3;
const [MIN_SLIDE_S, MAX_SLIDE_S] = [3, 12];

const readDraft = (dir) => JSON.parse(readFileSync(`${dir}/draft.json`, 'utf8'));
const saveDraft = (dir, draft) => writeFileSync(`${dir}/draft.json`, JSON.stringify(draft, null, 2) + '\n');

function assertAccount(draft, newsletter) {
  if (draft.newsletter !== newsletter.key) throw new Error(`This draft belongs to "${draft.newsletter}", not "${newsletter.key}"`);
}

/** How long a slide stays on screen: enough time to read it, since a viewer can't swipe back. */
export function slideSeconds(slide) {
  const words = [slide.title, slide.text, ...(slide.points ?? [])].filter(Boolean).join(' ').split(/\s+/).length;
  return Math.min(MAX_SLIDE_S, Math.max(MIN_SLIDE_S, Math.round(words / WORDS_PER_S + 1)));
}

/**
 * Slides → MP4 with crossfades. The track itself is attached by Instagram when the container is created, so the
 * file carries a silent audio stream only. Returns the video's length in seconds.
 */
function renderVideo(files, seconds, out) {
  const inputs = files.flatMap((f, i) => ['-loop', '1', '-framerate', String(FPS), '-t', String(seconds[i]), '-i', f]);
  const filters = [];
  let previous = '[0:v]';
  let offset = 0;
  for (let i = 1; i < files.length; i++) {
    offset += seconds[i - 1] - FADE_S;
    filters.push(`${previous}[${i}:v]xfade=transition=fade:duration=${FADE_S}:offset=${offset}[v${i}]`);
    previous = `[v${i}]`;
  }
  filters.push(`${previous}format=yuv420p[video]`);
  const total = offset + seconds[seconds.length - 1];
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', filters.join(';'), '-map', '[video]', '-map', `${files.length}:a`, '-t', String(total), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { stdio: 'inherit' });
  return total;
}

/** Long-form input → draft directory holding the copy and a new seed. This is the only step that calls AI. */
export async function createCarousel(input, newsletter, dirFor) {
  const source = await loadLongform(input);
  console.log(`[${newsletter.key}] Source: ${source.title} (${source.text.length} characters, from ${source.origin})`);
  const copy = await writeCarousel(source, newsletter);
  const dir = dirFor(source.title);
  mkdirSync(dir, { recursive: true });
  saveDraft(dir, { newsletter: newsletter.key, title: source.title, origin: source.origin, seed: randomBytes(6).toString('hex'), ...copy });
  return dir;
}

/**
 * (Re-)render a draft's slides and video from draft.json. Free and reproducible: the same seed and copy give the
 * same JPEGs, so hand edits to the copy are safe. AUDIO=<id> picks the track. RESEED=1 picks new artwork, WORLD=<name> forces a world.
 * Anything submitted earlier is forgotten, since it may no longer match what's on disk.
 */
export async function rerenderCarousel(dir, newsletter) {
  const draft = readDraft(dir);
  assertAccount(draft, newsletter);
  const problems = copyProblems(draft);
  if (problems.length) throw new Error(`${dir}/draft.json: ${problems.join('; ')}`);
  if (process.env.RESEED) draft.seed = randomBytes(6).toString('hex');

  const { tiles, world } = await renderBackgrounds(draft.seed, { slides: ROLES.length, world: process.env.WORLD });
  const brand = newsletter.brand;
  const logoHeight = Math.round(HEADER_LOGO_HEIGHT * Math.max(1, (brand.logoHeight ?? 72) / 72));
  let logo;
  if (brand.logo) {
    const { data, info } = await sharp(brand.logo).resize({ height: logoHeight, kernel: 'lanczos3' }).png().toBuffer({ resolveWithObject: true });
    logo = { png: data, width: info.width, height: info.height };
  }

  const images = [];
  for (const [i, slide] of draft.slides.entries()) {
    const file = `${dir}/${i + 1}-${slide.role}.jpg`;
    writeFileSync(file, await composeSlide(tiles[i], slide, i, draft.slides.length, brand, logo));
    images.push(file);
  }
  const video = `${dir}/reel.mp4`;
  const durationS = renderVideo(images, draft.slides.map(slideSeconds), video);
  if (process.env.AUDIO) {
    const { audio_id, title, display_artist, duration_in_ms, on_platform_audio_preview_link } = await audioInfo(process.env.AUDIO, newsletter.instagramUserIdEnv);
    draft.audio = { id: audio_id ?? process.env.AUDIO, title, artist: display_artist, durationMs: duration_in_ms, preview: on_platform_audio_preview_link ?? `https://www.instagram.com/reels/audio/${process.env.AUDIO}/` };
  }
  if (draft.audio?.durationMs < durationS * 1000) throw new Error(`"${draft.audio.title}" lasts ${Math.round(draft.audio.durationMs / 1000)} s and the video ${durationS} s: pick a longer track`);
  const { urls, videoUrl, coverUrl, containerId, containerAt, ...rest } = draft;
  const next = { ...rest, world, images, video, durationS };
  saveDraft(dir, next);
  return next;
}

const reelContainer = (draft, newsletter) =>
  createReelDraft(draft.videoUrl, draft.caption, { audioId: draft.audio.id, coverUrl: draft.coverUrl, instagramUserIdEnv: newsletter.instagramUserIdEnv });

/** Upload the video and create the unpublished Reel container. Nothing appears on the account. */
export async function submitCarousel(dir, newsletter) {
  const draft = readDraft(dir);
  assertAccount(draft, newsletter);
  if (!draft.audio?.id) throw new Error(`No track chosen for ${dir}: list them with \`audio ${newsletter.key}\`, then set AUDIO=<id>`);
  const name = dir.replace(/\/$/, '').split('/').pop();
  const prefix = `insta-stories/carousels/${name}`;
  const videoUrl = await hostOnS3(draft.video, prefix);
  const coverUrl = await hostOnS3(draft.images[0], prefix);
  console.log(`Uploaded ${videoUrl}, waiting for Instagram to process the video…`);
  const uploaded = { ...draft, videoUrl, coverUrl };
  const next = { ...uploaded, containerId: await reelContainer(uploaded, newsletter), containerAt: new Date().toISOString() };
  saveDraft(dir, next);
  return next;
}

/** Publish a submitted draft, recreating its container from the hosted video if it has expired. */
export async function publishCarousel(dir, newsletter) {
  const draft = readDraft(dir);
  assertAccount(draft, newsletter);
  if (draft.mediaId && !process.env.FORCE) throw new Error(`Already published as ${draft.mediaId} (set FORCE=1 to post it again)`);
  if (!draft.containerId) throw new Error(`Nothing submitted for ${dir}: run \`carousel ${newsletter.key} ${dir}\` without DRY_RUN first`);

  const expired = Date.now() - Date.parse(draft.containerAt) >= CONTAINER_TTL_MS || (await containerStatus(draft.containerId)) !== 'FINISHED';
  if (expired) {
    console.log('The draft container has expired; creating a new one from the same video.');
    draft.containerId = await reelContainer(draft, newsletter);
    draft.containerAt = new Date().toISOString();
    saveDraft(dir, draft);
  }
  const mediaId = await publishDraft(draft.containerId, newsletter.instagramUserIdEnv);
  saveDraft(dir, { ...draft, mediaId, publishedAt: new Date().toISOString() });
  return mediaId;
}
