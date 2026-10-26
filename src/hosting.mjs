import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { required } from './config.mjs';

/**
 * Instagram only takes public URLs: upload the JPEG to S3 (served through CloudFront) and return
 * its CDN URL once it answers. The key carries a content hash, so it's immutable and a re-render
 * never hits a stale CloudFront cache. Uses the aws CLI and its configured credentials.
 * Env: STORIES_S3_BUCKET, STORIES_CDN_BASE (the CloudFront origin of that bucket).
 */
export async function hostOnS3(file, prefix = 'insta-stories') {
  const bucket = required('STORIES_S3_BUCKET');
  const cdn = required('STORIES_CDN_BASE').replace(/\/$/, '');
  const hash = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);
  const key = `${prefix}/${basename(file, '.jpg')}-${hash}.jpg`;
  execFileSync('aws', ['s3', 'cp', file, `s3://${bucket}/${key}`, '--content-type', 'image/jpeg', '--cache-control', 'public, max-age=31536000, immutable', '--only-show-errors'], { stdio: 'inherit' });
  const url = `${cdn}/${key}`;
  for (let i = 0; i < 10; i++) {
    if ((await fetch(url, { method: 'HEAD' })).ok) return url;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Uploaded, but ${url} is not reachable — nothing was posted`);
}
