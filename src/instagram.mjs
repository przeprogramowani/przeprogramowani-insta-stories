import { GRAPH, required } from './config.mjs';

/**
 * Network errors are retried, except for media_publish: if that request reached Meta, a retry could post twice.
 * (A retried container creation only leaves an unused container behind.)
 */
async function graph(method, path, params) {
  const qs = new URLSearchParams({ ...params, access_token: required('META_ACCESS_TOKEN') });
  let res;
  for (let i = 0; ; i++) {
    try {
      res = await fetch(`${GRAPH}/${path}?${qs}`, { method });
      break;
    } catch (e) {
      if (path.endsWith('/media_publish') || i >= 3) throw new Error(`Graph ${path}: ${e.cause?.code ?? e.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  const body = await res.json();
  if (!res.ok) throw new Error(`Graph ${path}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}

/** Create a media container, wait until Instagram has fetched and processed it, publish; returns the media id. */
async function createAndPublish(igId, params, { attempts, intervalMs }) {
  const { id: containerId } = await graph('POST', `${igId}/media`, params);
  await waitUntilFinished(containerId, { attempts, intervalMs });
  const { id } = await graph('POST', `${igId}/media_publish`, { creation_id: containerId });
  return id;
}

async function waitUntilFinished(containerId, { attempts, intervalMs }) {
  for (let i = 0; ; i++) {
    const { status_code, status } = await graph('GET', containerId, { fields: 'status_code,status' });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Container ${status_code}: ${status}`);
    if (i >= attempts) throw new Error(`Container ${containerId} still ${status_code} — not published`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Create an unpublished carousel container from public JPEG URLs; returns its id. Nothing is visible on the
 * account. The Graph API has no real drafts: this container doesn't show up in the app's Drafts, and it
 * expires 24 hours after creation unless it's published with publishCarouselDraft().
 */
export async function createCarouselDraft(imageUrls, caption, instagramUserIdEnv = 'INSTAGRAM_USER_ID') {
  const igId = required(instagramUserIdEnv);
  const wait = { attempts: 20, intervalMs: 3000 };
  const children = [];
  for (const image_url of imageUrls) {
    const { id } = await graph('POST', `${igId}/media`, { image_url, is_carousel_item: 'true' });
    await waitUntilFinished(id, wait);
    children.push(id);
  }
  const { id } = await graph('POST', `${igId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
  await waitUntilFinished(id, wait);
  return id;
}

/** FINISHED means a draft container can still be published; anything else means it has to be recreated. */
export async function containerStatus(containerId) {
  return (await graph('GET', containerId, { fields: 'status_code' })).status_code;
}

/** Publish a container from createCarouselDraft(); this is the public step. Returns the media id. */
export async function publishCarouselDraft(containerId, instagramUserIdEnv = 'INSTAGRAM_USER_ID') {
  return (await graph('POST', `${required(instagramUserIdEnv)}/media_publish`, { creation_id: containerId })).id;
}

/** Publish a public JPEG URL as an Instagram Story; returns the media id. */
export async function publishStory(imageUrl, instagramUserIdEnv = 'INSTAGRAM_USER_ID') {
  return createAndPublish(required(instagramUserIdEnv), { image_url: imageUrl, media_type: 'STORIES' }, { attempts: 20, intervalMs: 3000 });
}

/**
 * Publish a public MP4 URL as a Reel (also shown in the profile grid); returns the media id.
 * Video processing takes from seconds to a few minutes, so poll for up to 10 minutes.
 */
export async function publishReel(videoUrl, caption, { instagramUserIdEnv = 'INSTAGRAM_USER_ID', coverUrl } = {}) {
  const params = { media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: 'true' };
  if (coverUrl) params.cover_url = coverUrl;
  return createAndPublish(required(instagramUserIdEnv), params, { attempts: 60, intervalMs: 10000 });
}

/** Public link of a published media item (for the report after posting). */
export async function permalink(mediaId) {
  return (await graph('GET', mediaId, { fields: 'permalink' })).permalink;
}
