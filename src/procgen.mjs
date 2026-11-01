import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';

// Procedural carousel backgrounds, built with game-dev techniques and no AI. One seed gives one wide
// panorama that is cut into the slides, so the artwork continues across every swipe. The seed is stored
// in the draft: the same seed always gives the same pixels, a new one gives a different world.

/** Slide canvas: 4:5 is the tallest ratio that is safe in a feed carousel. */
export const SLIDE = { width: 1080, height: 1350 };

const FIELD_SCALE = 3; // The soft nebula is computed at 1/3 size and upscaled; the crisp layers are vectors.

const BLUE_RAMP = [[5, 8, 23], [10, 20, 64], [19, 41, 110], [31, 63, 163]];
const PURPLE_RAMP = [[7, 5, 26], [26, 11, 71], [58, 20, 128], [96, 36, 184]];
const VIOLET = '#8b5cf6';
const INDIGO = '#6d8dff';
const ORANGE = '#ff7a1a';

const hashSeed = (s) => [...String(s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** mulberry32: small, fast, and reproducible across machines (Math.random is none of those). */
function makeRng(seed) {
  let a = hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, {
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
  });
}

/** Seeded 2D Perlin noise, range about -1..1. */
function makeNoise(rng) {
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const a = perm[perm[X] + Y];
    const b = perm[perm[X + 1] + Y];
    const c = perm[perm[X] + Y + 1];
    const d = perm[perm[X + 1] + Y + 1];
    const top = grad(a, xf, yf) + u * (grad(b, xf - 1, yf) - grad(a, xf, yf));
    const bottom = grad(c, xf, yf - 1) + u * (grad(d, xf - 1, yf - 1) - grad(c, xf, yf - 1));
    return (top + v * (bottom - top)) * 1.42;
  };
  /** Fractal Brownian motion: several octaves of noise, like a game's terrain heightmap. */
  noise.fbm = (x, y, octaves = 5) => {
    let sum = 0;
    let amp = 0.5;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x, y);
      x = x * 2 + 17.3;
      y = y * 2 + 9.1;
      amp /= 2;
    }
    return sum;
  };
  return noise;
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

function sampleRamp(ramp, t) {
  const f = clamp01(t) * (ramp.length - 1);
  const i = Math.min(Math.floor(f), ramp.length - 2);
  const k = f - i;
  return [0, 1, 2].map((c) => ramp[i][c] + (ramp[i + 1][c] - ramp[i][c]) * k);
}

/** Domain-warped fBm nebula, blending the blue and purple ramps so both colours show on every slide. */
function renderField(rng, noise, W, H) {
  const w = Math.ceil(W / FIELD_SCALE);
  const h = Math.ceil(H / FIELD_SCALE);
  const freq = rng.range(0.55, 1.15) / h;
  const warp = rng.range(0.5, 1.4);
  const contrast = rng.range(0.9, 1.35);
  const blendFreq = rng.range(0.35, 0.8) / h;
  const offset = rng.range(0, 500);
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0, o = 0; y < h; y++) {
    const edge = 1 - 0.45 * Math.abs(y / h - 0.5) ** 2 * 4; // Darker towards the top and bottom edges.
    for (let x = 0; x < w; x++, o += 3) {
      const px = x * freq + offset;
      const py = y * freq + offset;
      const qx = noise.fbm(px, py, 3);
      const qy = noise.fbm(px + 5.2, py + 1.3, 3);
      const t = clamp01((noise.fbm(px + warp * qx, py + warp * qy, 4) * contrast + 0.3) * edge);
      const blend = clamp01(noise(x * blendFreq + 40, y * blendFreq + 7) * 1.4 + 0.5);
      const a = sampleRamp(BLUE_RAMP, t);
      const b = sampleRamp(PURPLE_RAMP, t);
      for (let c = 0; c < 3; c++) out[o + c] = a[c] + (b[c] - a[c]) * blend;
    }
  }
  return { raw: out, w, h };
}

const num = (n) => Math.round(n * 10) / 10;
const pathOf = (pts, close = false) => `M${pts.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}${close ? 'Z' : ''}`;
/** Draw shapes twice: a blurred copy underneath gives the neon glow. */
const glow = (body) => `<g filter="url(#glow)" opacity="0.85">${body}</g>${body}`;

// ---- Structure layers: one per world, each a classic generative technique. ----

/** Particles following curl noise, the way game engines fake smoke and fluid. */
function flowField({ rng, noise, W, H }) {
  const freq = rng.range(1.2, 2.6) / H;
  const count = Math.round((W * H) / 4500);
  let cool = '';
  let hot = '';
  for (let i = 0; i < count; i++) {
    let x = rng() * W;
    let y = rng() * H;
    const pts = [[x, y]];
    const steps = rng.int(30, 90);
    for (let s = 0; s < steps; s++) {
      const e = 0.02;
      const dx = (noise.fbm(x * freq, (y + 20) * freq, 3) - noise.fbm(x * freq, (y - 20) * freq, 3)) / e;
      const dy = -(noise.fbm((x + 20) * freq, y * freq, 3) - noise.fbm((x - 20) * freq, y * freq, 3)) / e;
      const len = Math.hypot(dx, dy) || 1;
      x += (dx / len) * 9;
      y += (dy / len) * 9;
      pts.push([x, y]);
    }
    const path = `<path d="${pathOf(pts)}"/>`;
    if (rng() < 0.012) hot += path;
    else cool += path;
  }
  return `<g fill="none" stroke-linecap="round"><g stroke="${VIOLET}" stroke-width="1.3" opacity="0.5">${cool}</g><g stroke="${ORANGE}" stroke-width="1.8" opacity="0.8">${glow(hot)}</g></g>`;
}

/** A heightmap flown over at low altitude: the classic wireframe terrain. */
function terrain({ rng, noise, W, H }) {
  const horizon = H * rng.range(0.52, 0.72);
  const rows = 46;
  const amp = rng.range(130, 300);
  const freq = rng.range(0.9, 1.9);
  let out = '';
  for (let r = 0; r < rows; r++) {
    const z = r / (rows - 1);
    const persp = 0.06 + z * z * 0.94; // Rows bunch up towards the horizon.
    const y0 = horizon + (H - horizon + 80) * persp;
    const pts = [];
    for (let x = -30; x <= W + 30; x += 30) {
      const wx = ((x - W / 2) / W) * 9 / (0.25 + persp);
      const height = 0.25 + Math.abs(noise.fbm(wx * freq, (1 / (0.12 + persp)) * freq * 0.5, 4)) * 1.9;
      pts.push([x, y0 - height * amp * (0.5 + persp)]);
    }
    const stroke = r % 9 === 4 ? ORANGE : r % 2 ? INDIGO : VIOLET;
    const opacity = r % 9 === 4 ? 0.8 : 0.4 + z * 0.4;
    out += `<path d="${pathOf([...pts, [W + 30, H + 40], [-30, H + 40]], true)}" fill="#070a26" fill-opacity="0.88" stroke="${stroke}" stroke-opacity="${num(opacity)}" stroke-width="${num(1 + z)}"/>`;
  }
  return out;
}

/** Marching squares over a heightmap: the isolines of a topographic game map. */
function contours({ rng, noise, W, H }) {
  const cell = 16;
  const cols = Math.ceil(W / cell) + 1;
  const rows = Math.ceil(H / cell) + 1;
  const freq = rng.range(1.5, 3) / H;
  const heights = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) heights[j * cols + i] = noise.fbm(i * cell * freq, j * cell * freq, 4);
  const levels = 13;
  const hotLevel = rng.int(3, levels - 4);
  let out = '';
  for (let l = 0; l < levels; l++) {
    const level = -0.55 + (1.1 * l) / (levels - 1);
    let d = '';
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = heights[j * cols + i];
        const b = heights[j * cols + i + 1];
        const c = heights[(j + 1) * cols + i + 1];
        const e = heights[(j + 1) * cols + i];
        const x = i * cell;
        const y = j * cell;
        const hits = [];
        if (a < level !== b < level) hits.push([x + (cell * (level - a)) / (b - a), y]);
        if (b < level !== c < level) hits.push([x + cell, y + (cell * (level - b)) / (c - b)]);
        if (e < level !== c < level) hits.push([x + (cell * (level - e)) / (c - e), y + cell]);
        if (a < level !== e < level) hits.push([x, y + (cell * (level - a)) / (e - a)]);
        if (hits.length >= 2) d += pathOf(hits.slice(0, 2));
        if (hits.length === 4) d += pathOf(hits.slice(2, 4));
      }
    }
    const isHot = l === hotLevel;
    const line = `<path d="${d}" fill="none" stroke="${isHot ? ORANGE : l % 2 ? VIOLET : INDIGO}" stroke-width="${isHot ? 2 : 1.3}" stroke-opacity="${isHot ? 0.8 : 0.55}"/>`;
    out += isHot ? glow(line) : line;
  }
  return out;
}

/** Voronoi cells: crystal shards, cut with half-plane clipping. */
function shards({ rng, W, H }) {
  const size = rng.range(150, 260);
  const sites = [];
  for (let x = -size; x < W + size; x += size) for (let y = -size; y < H + size; y += size) sites.push([x + rng() * size, y + rng() * size]);
  let out = '';
  for (const site of sites) {
    let poly = [[site[0] - 900, site[1] - 900], [site[0] + 900, site[1] - 900], [site[0] + 900, site[1] + 900], [site[0] - 900, site[1] + 900]];
    for (const other of sites) {
      if (other === site || Math.hypot(other[0] - site[0], other[1] - site[1]) > size * 4) continue;
      const mx = (site[0] + other[0]) / 2;
      const my = (site[1] + other[1]) / 2;
      const nx = other[0] - site[0];
      const ny = other[1] - site[1];
      const side = ([x, y]) => (x - mx) * nx + (y - my) * ny;
      const clipped = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const sp = side(p);
        const sq = side(q);
        if (sp <= 0) clipped.push(p);
        if (sp <= 0 !== sq <= 0) {
          const t = sp / (sp - sq);
          clipped.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
      poly = clipped;
      if (!poly.length) break;
    }
    if (poly.length < 3) continue;
    const hot = rng() < 0.05;
    const fill = rng() < 0.5 ? INDIGO : VIOLET;
    out += `<path d="${pathOf(poly, true)}" fill="${hot ? ORANGE : fill}" fill-opacity="${num(hot ? 0.2 : rng.range(0.03, 0.22))}" stroke="${hot ? ORANGE : fill}" stroke-opacity="${hot ? 0.9 : 0.65}" stroke-width="${hot ? 2.2 : 1.4}"/>`;
  }
  return out;
}

/** Evenly spread nodes (best-candidate sampling) linked to their nearest neighbours: a star map. */
function constellation({ rng, W, H }) {
  const nodes = [];
  const count = Math.round((W * H) / 26000);
  for (let n = 0; n < count; n++) {
    let best;
    let bestDist = -1;
    for (let c = 0; c < 12; c++) {
      const cand = [rng() * W, rng() * H];
      const dist = nodes.reduce((m, p) => Math.min(m, Math.hypot(p[0] - cand[0], p[1] - cand[1])), Infinity);
      if (dist > bestDist) [best, bestDist] = [cand, dist];
    }
    nodes.push(best);
  }
  let lines = '';
  nodes.forEach((a, i) => {
    const near = nodes
      .map((b, j) => [Math.hypot(a[0] - b[0], a[1] - b[1]), j])
      .filter(([, j]) => j !== i)
      .sort((p, q) => p[0] - q[0])
      .slice(0, rng.int(1, 3));
    for (const [, j] of near) lines += pathOf([a, nodes[j]]);
  });
  let dots = '';
  let hot = '';
  for (const [x, y] of nodes) {
    if (rng() < 0.07) hot += `<circle cx="${num(x)}" cy="${num(y)}" r="${num(rng.range(4, 7))}"/>`;
    else dots += `<circle cx="${num(x)}" cy="${num(y)}" r="${num(rng.range(1.5, 4))}"/>`;
  }
  return `<path d="${lines}" fill="none" stroke="${INDIGO}" stroke-opacity="0.6" stroke-width="1.4"/><g fill="#cfd8ff" opacity="0.95">${dots}</g><g fill="${ORANGE}">${glow(hot)}</g>`;
}

/** Cellular-automaton caves, the roguelike level-generation classic, drawn as a blocky map. */
function caves({ rng, W, H }) {
  const cell = rng.pick([30, 36, 42]);
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  let grid = new Uint8Array(cols * rows).map(() => (rng() < 0.5 ? 1 : 0));
  const at = (g, i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 1 : g[j * cols + i]);
  for (let step = 0; step < 4; step++) {
    const next = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let walls = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) walls += at(grid, i + di, j + dj);
        next[j * cols + i] = walls >= 5 ? 1 : 0;
      }
    }
    grid = next;
  }
  let fill = '';
  let edges = '';
  let loot = '';
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cell;
      const y = j * cell;
      if (at(grid, i, j)) {
        fill += `M${x} ${y}h${cell}v${cell}h${-cell}Z`;
        if (!at(grid, i + 1, j)) edges += `M${x + cell} ${y}v${cell}`;
        if (!at(grid, i - 1, j)) edges += `M${x} ${y}v${cell}`;
        if (!at(grid, i, j + 1)) edges += `M${x} ${y + cell}h${cell}`;
        if (!at(grid, i, j - 1)) edges += `M${x} ${y}h${cell}`;
      } else if (rng() < 0.012) {
        loot += `<rect x="${x + cell * 0.3}" y="${y + cell * 0.3}" width="${cell * 0.4}" height="${cell * 0.4}"/>`;
      }
    }
  }
  return `<path d="${fill}" fill="#04061c" fill-opacity="0.72"/><path d="${edges}" fill="none" stroke="${VIOLET}" stroke-opacity="0.95" stroke-width="2"/><g fill="${ORANGE}">${glow(loot)}</g>`;
}

const WORLDS = { flowField, terrain, contours, shards, constellation, caves };

// ---- Accents, shared by every world. ----

function stars({ rng, W, H }) {
  let dim = '';
  let bright = '';
  for (let i = 0, n = Math.round((W * H) / 9000); i < n; i++) {
    const dot = `<circle cx="${num(rng() * W)}" cy="${num(rng() * H)}" r="${num(rng.range(0.6, 1.9))}"/>`;
    if (rng() < 0.15) bright += dot;
    else dim += dot;
  }
  return `<g fill="#dfe6ff"><g opacity="0.35">${dim}</g><g opacity="0.9">${bright}</g></g>`;
}

/** A planet straddling a slide seam, so swiping reveals the rest of it. */
function planet({ rng, W, H }) {
  const r = rng.range(170, 340);
  const cx = SLIDE.width * rng.int(1, Math.round(W / SLIDE.width) - 1) + rng.range(-120, 120);
  const cy = rng.range(H * 0.15, H * 0.85);
  const angle = rng.range(-28, 28);
  const lit = rng.pick([-1, 1]);
  const ring = rng() < 0.65 ? `<ellipse cx="${num(cx)}" cy="${num(cy)}" rx="${num(r * 1.75)}" ry="${num(r * 0.34)}" fill="none" stroke="${ORANGE}" stroke-opacity="0.65" stroke-width="2" transform="rotate(${num(angle)} ${num(cx)} ${num(cy)})"/>` : '';
  return `<defs><radialGradient id="body" cx="${0.5 + lit * 0.32}" cy="0.35" r="0.85"><stop offset="0" stop-color="#3b2a9c"/><stop offset="0.55" stop-color="#150d4f"/><stop offset="1" stop-color="#05061c"/></radialGradient><radialGradient id="rim" cx="${0.5 + lit * 0.035}" cy="0.48" r="0.53"><stop offset="0.88" stop-color="${ORANGE}" stop-opacity="0"/><stop offset="1" stop-color="${ORANGE}" stop-opacity="0.9"/></radialGradient></defs><circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="url(#body)"/><circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="url(#rim)"/>${ring}`;
}

/** One orange line wandering through the whole panorama: a thread that pulls the reader to the next slide. */
function signalLine({ rng, noise, W, H }) {
  const base = H * rng.range(0.74, 0.9);
  const seed = rng.range(0, 300);
  const pts = [];
  for (let x = -10; x <= W + 10; x += 14) pts.push([x, base + noise.fbm(x / 900 + seed, seed, 3) * 260]);
  const sparks = [];
  for (let k = 0, n = rng.int(8, 16); k < n; k++) sparks.push(rng.pick(pts));
  const line = `<path d="${pathOf(pts)}" fill="none" stroke="${ORANGE}" stroke-width="2.2" stroke-opacity="0.9"/>${sparks.map(([x, y]) => `<circle cx="${num(x)}" cy="${num(y)}" r="${num(rng.range(3, 6))}" fill="${ORANGE}"/>`).join('')}`;
  return glow(line);
}

function renderVectors(ctx, world) {
  const { W, H } = ctx;
  const usePlanet = ctx.rng() < 0.55;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><filter id="glow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="6"/></filter></defs>${stars(ctx)}${WORLDS[world](ctx)}${usePlanet ? planet(ctx) : ''}${signalLine(ctx)}</svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

/**
 * The whole carousel's art, cut into `slides` PNG tiles of SLIDE size. `world` picks a structure layer
 * (for tests and previews); by default the seed picks one.
 */
export async function renderBackgrounds(seed, { slides = 5, world } = {}) {
  const rng = makeRng(seed);
  const noise = makeNoise(rng);
  const W = SLIDE.width * slides;
  const H = SLIDE.height;
  const chosen = world ?? rng.pick(Object.keys(WORLDS));
  if (!WORLDS[chosen]) throw new Error(`Unknown world "${chosen}". Known: ${Object.keys(WORLDS).join(', ')}`);
  const ctx = { rng, noise, W, H };

  const field = renderField(rng, noise, W, H);
  const vectors = renderVectors(ctx, chosen);
  const { data, info } = await sharp(field.raw, { raw: { width: field.w, height: field.h, channels: 3 } })
    .resize(W, H, { kernel: 'cubic' })
    .composite([{ input: Buffer.from(vectors) }])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Film grain hides the banding that dark gradients get in JPEG.
  for (let i = 0; i < data.length; i += info.channels) {
    const g = (rng() - 0.5) * 7;
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, data[i + c] + g));
  }

  const tiles = [];
  for (let s = 0; s < slides; s++) {
    tiles.push(
      await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .extract({ left: s * SLIDE.width, top: 0, width: SLIDE.width, height: SLIDE.height })
        .png()
        .toBuffer(),
    );
  }
  return { tiles, world: chosen };
}

export const WORLD_NAMES = Object.keys(WORLDS);
