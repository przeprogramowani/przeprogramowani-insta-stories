import { GRAPH, required } from './config.mjs';

async function graph(method, path, params) {
  const qs = new URLSearchParams({ ...params, access_token: required('META_ACCESS_TOKEN') });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { method });
  const body = await res.json();
  if (!res.ok) throw new Error(`Graph ${path}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}

/** Publish a public JPEG URL as an Instagram Story; returns the media id. */
export async function publishStory(imageUrl, instagramUserIdEnv = 'INSTAGRAM_USER_ID') {
  const igId = required(instagramUserIdEnv);
  const { id: containerId } = await graph('POST', `${igId}/media`, { image_url: imageUrl, media_type: 'STORIES' });

  // Instagram fetches and processes the image asynchronously.
  for (let i = 0; i < 20; i++) {
    const { status_code, status } = await graph('GET', containerId, { fields: 'status_code,status' });
    if (status_code === 'FINISHED') break;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Container ${status_code}: ${status}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  const { id } = await graph('POST', `${igId}/media_publish`, { creation_id: containerId });
  return id;
}
