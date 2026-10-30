import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { required } from './config.mjs';

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };

/**
 * Instagram only takes public URLs: upload the JPEG (or a Reel's MP4) to S3 (served through CloudFront) and return
 * its CDN URL once it answers. The key carries a content hash, so it's immutable and a re-render
 * never hits a stale CloudFront cache. Uses the aws CLI and its configured credentials.
 * Env: STORIES_S3_BUCKET, STORIES_CDN_BASE (the CloudFront origin of that bucket).
 */
export async function hostOnS3(file, prefix = 'insta-stories') {
  const bucket = required('STORIES_S3_BUCKET');
  const cdn = required('STORIES_CDN_BASE').replace(/\/$/, '');
  const hash = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);
  const ext = extname(file).toLowerCase();
  if (!TYPES[ext]) throw new Error(`Can't host ${file}: only ${Object.keys(TYPES).join(', ')}`);
  const key = `${prefix}/${basename(file, extname(file))}-${hash}${ext}`;
  execFileSync('aws', ['s3', 'cp', file, `s3://${bucket}/${key}`, '--content-type', TYPES[ext], '--cache-control', 'public, max-age=31536000, immutable', '--only-show-errors'], { stdio: 'inherit' });
  const url = `${cdn}/${key}`;
  for (let i = 0; i < 10; i++) {
    if ((await fetch(url, { method: 'HEAD' })).ok) return url;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Uploaded, but ${url} is not reachable — nothing was posted`);
}
