import { statSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { STORY } from './config.mjs';

// Instagram Reels limits (Graph API content publishing): MP4/MOV, H.264 or HEVC, AAC, 3 s–15 min, ≤300 MB, 23–60 fps.
const MIN_S = 3;
const MAX_S = 15 * 60;
const MAX_MB = 300;

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  const { format, streams } = JSON.parse(out);
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error(`${file} has no video stream`);
  const [n, d] = (v.avg_frame_rate || v.r_frame_rate).split('/').map(Number);
  // Phone videos store portrait as landscape + a rotation tag; report what the viewer sees.
  const rotation = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0));
  const [width, height] = rotation % 180 === 90 ? [v.height, v.width] : [v.width, v.height];
  return { duration: Number(format.duration), sizeMb: Number(format.size) / 1e6, container: format.format_name, video: v.codec_name, audio: a?.codec_name ?? null, fps: d ? n / d : n, width, height };
}

/**
 * Check a local video against the Reels limits and write an Instagram-friendly MP4 to stories/reels/:
 * H.264/AAC streams are only remuxed with the index at the front (lossless, seconds); anything else is
 * re-encoded. Returns { file, info, warnings }.
 */
export function prepareReel(input) {
  const info = probe(input);
  if (info.duration < MIN_S || info.duration > MAX_S) throw new Error(`Video is ${info.duration.toFixed(1)} s — Reels must be ${MIN_S} s to 15 min`);
  const warnings = [];
  const ratio = info.width / info.height;
  if (Math.abs(ratio - 9 / 16) > 0.02) warnings.push(`aspect ${info.width}×${info.height} isn't 9:16 — Instagram will letterbox or crop it`);
  if (!info.audio) warnings.push('no audio track');

  mkdirSync('stories/reels', { recursive: true });
  const file = `stories/reels/${basename(input, extname(input)).replace(/[^\w.-]+/g, '-')}.mp4`;
  const copy = info.video === 'h264' && (info.audio === 'aac' || !info.audio) && info.fps <= 60 && info.width <= 1920 && info.height <= 1920;
  const args = copy
    ? ['-c', 'copy']
    : ['-vf', `scale='min(${STORY.width},iw)':-2,fps='min(30,source_fps)'`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000'];
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input, ...args, '-movflags', '+faststart', file], { stdio: 'inherit' });

  const sizeMb = statSync(file).size / 1e6;
  if (sizeMb > MAX_MB) throw new Error(`Prepared video is ${sizeMb.toFixed(0)} MB — Reels must be ≤${MAX_MB} MB`);
  return { file, info: { ...info, sizeMb, reencoded: !copy }, warnings };
}

/** Optional cover: any image sharp reads → 1080×1920 JPEG next to the video. */
export async function prepareCover(input, videoFile) {
  const raw = /^https?:\/\//.test(input) ? Buffer.from(await (await fetch(input)).arrayBuffer()) : readFileSync(input);
  const file = videoFile.replace(/\.mp4$/, '-cover.jpg');
  writeFileSync(file, await sharp(raw).rotate().resize(STORY.width, STORY.height, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer());
  return file;
}
