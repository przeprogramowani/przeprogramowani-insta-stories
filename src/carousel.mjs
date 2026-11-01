import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { copyProblems, ROLES, writeCarousel } from './carousel-copy.mjs';
import { composeSlide } from './carousel-layout.mjs';
import { hostOnS3 } from './hosting.mjs';
import { containerStatus, createCarouselDraft, publishCarouselDraft } from './instagram.mjs';
import { loadLongform } from './longform.mjs';
import { renderBackgrounds } from './procgen.mjs';

const CONTAINER_TTL_MS = 24 * 3600 * 1000;
const HEADER_LOGO_HEIGHT = 34; // For a one-line wordmark; scaled up with brand.logoHeight for stacked ones.

const readDraft = (dir) => JSON.parse(readFileSync(`${dir}/draft.json`, 'utf8'));
const saveDraft = (dir, draft) => writeFileSync(`${dir}/draft.json`, JSON.stringify(draft, null, 2) + '\n');

function assertAccount(draft, newsletter) {
  if (draft.newsletter !== newsletter.key) throw new Error(`This draft belongs to "${draft.newsletter}", not "${newsletter.key}"`);
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
 * (Re-)render a draft's slides from draft.json. Free and reproducible: the same seed and copy give the same
 * JPEGs, so hand edits to the copy are safe. RESEED=1 picks new artwork, WORLD=<name> forces a world.
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
  const { urls, containerId, containerAt, ...rest } = draft;
  const next = { ...rest, world, images };
  saveDraft(dir, next);
  return next;
}

/** Upload the slides and create the unpublished Instagram container. Nothing appears on the account. */
export async function submitCarousel(dir, newsletter) {
  const draft = readDraft(dir);
  assertAccount(draft, newsletter);
  const name = dir.replace(/\/$/, '').split('/').pop();
  const urls = [];
  for (const file of draft.images) urls.push(await hostOnS3(file, `insta-stories/carousels/${name}`));
  const containerId = await createCarouselDraft(urls, draft.caption, newsletter.instagramUserIdEnv);
  const next = { ...draft, urls, containerId, containerAt: new Date().toISOString() };
  saveDraft(dir, next);
  return next;
}

/** Publish a submitted draft, recreating its container from the hosted images if it has expired. */
export async function publishCarousel(dir, newsletter) {
  const draft = readDraft(dir);
  assertAccount(draft, newsletter);
  if (draft.mediaId && !process.env.FORCE) throw new Error(`Already published as ${draft.mediaId} (set FORCE=1 to post it again)`);
  if (!draft.containerId) throw new Error(`Nothing submitted for ${dir}: run \`carousel ${newsletter.key} ${dir}\` without DRY_RUN first`);

  const expired = Date.now() - Date.parse(draft.containerAt) >= CONTAINER_TTL_MS || (await containerStatus(draft.containerId)) !== 'FINISHED';
  if (expired) {
    console.log('The draft container has expired; creating a new one from the same images.');
    draft.containerId = await createCarouselDraft(draft.urls, draft.caption, newsletter.instagramUserIdEnv);
    draft.containerAt = new Date().toISOString();
    saveDraft(dir, draft);
  }
  const mediaId = await publishCarouselDraft(draft.containerId, newsletter.instagramUserIdEnv);
  saveDraft(dir, { ...draft, mediaId, publishedAt: new Date().toISOString() });
  return mediaId;
}
