import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { FONTS, h } from './layout.mjs';
import { SLIDE } from './procgen.mjs';

const MARGIN = 88;
const TEXT_WIDTH = SLIDE.width - MARGIN * 2;
const ORANGE = '#ff7a1a';
const BODY = '#dfe3f7';
const KICKERS = { problem: 'PROBLEM', solution: 'ROZWIĄZANIE', deepening: 'GŁĘBIEJ', cta: 'TWÓJ RUCH' };

// Unbounded is a wide face: its light weight averages about 0.74em per character, capitals included.
const UNBOUNDED_EM = 0.74;

/** Largest size at which the title fits in maxLines and no single word overflows (Polish words get long). */
export function fitTitle(title, sizes, maxLines) {
  const widthOf = (word, size) => word.length * size * UNBOUNDED_EM;
  for (const size of sizes) {
    const words = title.split(/\s+/);
    if (words.some((w) => widthOf(w, size) > TEXT_WIDTH)) continue;
    let lines = 1;
    let used = 0;
    for (const word of words) {
      const next = (used ? used + size * UNBOUNDED_EM : 0) + widthOf(word, size);
      if (next > TEXT_WIDTH) {
        lines++;
        used = widthOf(word, size);
      } else used = next;
    }
    if (lines <= maxLines) return size;
  }
  // Nothing fits, usually because of one very long word: shrink until that word does.
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  return Math.min(sizes[sizes.length - 1], Math.floor(TEXT_WIDTH / (longest * UNBOUNDED_EM)));
}

const svgImg = (svg, width, height, style = {}) => ({
  type: 'img',
  props: { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width, height, style },
});

const pngImg = ({ png, width, height }, style = {}) => ({
  type: 'img',
  props: { src: `data:image/png;base64,${png.toString('base64')}`, width, height, style },
});

const header = (index, total, logo) =>
  h(
    'div',
    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
    logo ? pngImg(logo) : h('div', { display: 'flex' }),
    h(
      'div',
      { display: 'flex', fontFamily: 'Unbounded', fontWeight: 300, fontSize: 24, letterSpacing: 3 },
      h('div', { color: ORANGE }, String(index + 1).padStart(2, '0')),
      h('div', { color: 'rgba(255,255,255,0.55)', marginLeft: 12 }, `/ ${String(total).padStart(2, '0')}`),
    ),
  );

const footer = (index, total) =>
  h(
    'div',
    { position: 'absolute', left: MARGIN, right: MARGIN, bottom: 72, display: 'flex', alignItems: 'center', gap: 10 },
    ...Array.from({ length: total }, (_, i) =>
      h('div', { flexGrow: 1, height: 4, borderRadius: 2, background: i === index ? ORANGE : i < index ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.22)' }),
    ),
    ...(index < total - 1
      ? [svgImg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 28"><path d="M0 14H60M48 2L60 14L48 26" fill="none" stroke="${ORANGE}" stroke-width="3"/></svg>`, 64, 28, { marginLeft: 18 })]
      : []),
  );

const kicker = (text) =>
  h(
    'div',
    { display: 'flex', alignItems: 'center', marginBottom: 34 },
    h('div', { width: 56, height: 3, background: ORANGE, marginRight: 22 }),
    h('div', { fontFamily: 'Unbounded', fontWeight: 600, fontSize: 25, letterSpacing: 5, color: ORANGE }, text),
  );

const title = (text, size) =>
  h('div', { fontFamily: 'Unbounded', fontWeight: 300, fontSize: size, lineHeight: 1.22, color: '#fff' }, text);

const body = (text, size = 39) =>
  h('div', { fontFamily: 'Sora', fontWeight: 300, fontSize: size, lineHeight: 1.5, color: BODY, marginTop: 40 }, text);

function content(slide, url) {
  switch (slide.role) {
    case 'hook':
      return [
        h(
          'div',
          { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', paddingBottom: 90 },
          title(slide.title, fitTitle(slide.title, [96, 88, 80, 72, 64, 56], 5)),
          h('div', { width: 120, height: 4, background: ORANGE, marginTop: 52 }),
          body(slide.text, 40),
        ),
      ];
    case 'deepening':
      return [
        h('div', { display: 'flex', marginTop: 110 }, kicker(KICKERS.deepening)),
        title(slide.title, fitTitle(slide.title, [62, 56, 50, 44], 3)),
        h(
          'div',
          { display: 'flex', flexDirection: 'column', marginTop: 56, gap: 40 },
          ...slide.points.map((point, i) =>
            h(
              'div',
              { display: 'flex', alignItems: 'flex-start' },
              h('div', { fontFamily: 'Unbounded', fontWeight: 300, fontSize: 34, color: ORANGE, width: 92, flexShrink: 0, lineHeight: 1.45 }, `0${i + 1}`),
              h('div', { fontFamily: 'Sora', fontWeight: 300, fontSize: 36, lineHeight: 1.45, color: BODY, flexGrow: 1, width: TEXT_WIDTH - 92 }, point),
            ),
          ),
        ),
      ];
    case 'cta':
      return [
        h(
          'div',
          { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', paddingBottom: 90 },
          h('div', { display: 'flex' }, kicker(KICKERS.cta)),
          title(slide.title, fitTitle(slide.title, [76, 68, 60, 52], 4)),
          body(slide.text, 40),
          h(
            'div',
            { display: 'flex', alignSelf: 'flex-start', marginTop: 56, padding: '22px 38px', borderRadius: 60, border: `2px solid ${ORANGE}`, background: 'rgba(5,7,28,0.82)', fontFamily: 'Sora', fontWeight: 400, fontSize: 33, color: '#fff' },
            slide.url ?? url,
          ),
        ),
      ];
    default:
      return [
        h('div', { display: 'flex', marginTop: 110 }, kicker(KICKERS[slide.role])),
        title(slide.title, fitTitle(slide.title, [68, 62, 56, 50], 3)),
        body(slide.text),
      ];
  }
}

/** Text overlay on a transparent canvas. The scrim darkens the art behind the text, least so near the bottom. */
export function slideTree(slide, index, total, brand, logo) {
  return h(
    'div',
    { width: SLIDE.width, height: SLIDE.height, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative', padding: `76px ${MARGIN}px 130px`, backgroundImage: 'linear-gradient(180deg, rgba(5,7,28,0.62) 0%, rgba(5,7,28,0.58) 68%, rgba(5,7,28,0.2) 100%)' },
    header(index, total, logo),
    ...content(slide, brand.url),
    footer(index, total),
  );
}

/** One slide: text overlay composited over its background tile → 1080×1350 JPEG (Instagram only takes JPEG). */
export async function composeSlide(backgroundPng, slide, index, total, brand, logo) {
  const svg = await satori(slideTree(slide, index, total, brand, logo), { width: SLIDE.width, height: SLIDE.height, fonts: FONTS });
  const overlay = new Resvg(svg, { fitTo: { mode: 'width', value: SLIDE.width } }).render().asPng();
  return sharp(backgroundPng).composite([{ input: Buffer.from(overlay) }]).jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toBuffer();
}
