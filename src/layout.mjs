import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { STORY } from './config.mjs';

const font = (name, file, weight) => ({ name, weight, style: 'normal', data: readFileSync(`assets/fonts/${file}`) });
const FONTS = [
  font('Anton', 'Anton-Regular.ttf', 400),
  font('Josefin Sans', 'JosefinSans-SemiBold.ttf', 600),
  font('Inter', 'Inter-Regular.ttf', 400),
  font('Inter', 'Inter-Bold.ttf', 700),
  font('Unbounded', 'Unbounded-SemiBold.ttf', 600),
];

// Tiny hyperscript helper so the layout reads like markup without a JSX build step.
const h = (type, style, ...children) => ({ type, props: { style, children: children.flat() } });


/** Template layout (badge, header band, "W tym wydaniu:", 3 lead cards) over the background, branded per newsletter. */
export function storyTree(backgroundPng, leads, brand) {
  const PANEL = brand.panel;
  const BORDER = `1.5px solid ${brand.accent}`;
  const bg = `data:image/png;base64,${backgroundPng.toString('base64')}`;

  return h(
    'div',
    // Background as CSS: Satori paints absolutely positioned children last, so an <img> layer would cover the content.
    { width: STORY.width, height: STORY.height, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', fontFamily: 'Inter', color: '#fff', backgroundImage: `url(${bg})`, backgroundSize: `${STORY.width}px ${STORY.height}px` },

    // Header band — starts below Instagram's progress bar / avatar row.
    h(
      'div',
      { marginTop: 250, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 40px 40px', background: PANEL, borderTop: BORDER, borderBottom: BORDER },
      ...brand.headline.map((line) => h('div', { fontFamily: 'Anton', fontSize: 108, lineHeight: 1.05, letterSpacing: 1 }, line)),
      h('div', { fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 46, marginTop: 22, color: brand.urlColor, letterSpacing: 1 }, brand.url),
    ),

    // "NOWE WYDANIE" badge overlapping the band's top-left corner.
    h(
      'div',
      { position: 'absolute', top: 128, left: 36, width: 190, height: 190, borderRadius: 95, background: brand.badge, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-14deg)', boxShadow: '0 8px 30px rgba(0,0,0,0.45)' },
      h('div', { fontFamily: 'Anton', fontSize: 42, lineHeight: 1.05 }, 'NOWE'),
      h('div', { fontFamily: 'Anton', fontSize: 42, lineHeight: 1.05 }, 'WYDANIE'),
    ),

    h(
      'div',
      { marginTop: 70, display: 'flex', padding: '10px 56px 14px', borderRadius: 18, background: PANEL, border: BORDER, fontFamily: 'Anton', fontSize: 66 },
      'W tym wydaniu:',
    ),

    h(
      'div',
      { marginTop: 44, alignSelf: 'stretch', padding: '0 60px', display: 'flex', flexDirection: 'column', gap: 34 },
      ...leads.map((l) =>
        h(
          'div',
          { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '26px 34px 30px', borderRadius: 20, background: PANEL, border: BORDER, textAlign: 'center' },
          h('div', { fontWeight: 700, fontSize: 44, lineHeight: 1.2 }, l.title),
          h('div', { fontWeight: 400, fontSize: 35, lineHeight: 1.35, marginTop: 12, color: brand.bodyText }, l.text),
        ),
      ),
    ),
  );
}

export async function composeStory(backgroundPng, leads, brand) {
  const svg = await satori(storyTree(backgroundPng, leads, brand), { width: STORY.width, height: STORY.height, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: 'width', value: STORY.width } }).render().asPng();
}

/** Ad-hoc Story: the brand logo (if any), the thumbnail as a card over its own blurred copy, and a caption panel below it. */
export function customTree(backgroundPng, thumb, caption, brand, logo) {
  const BORDER = `1.5px solid ${brand.accent}`;
  const bg = `data:image/png;base64,${backgroundPng.toString('base64')}`;
  // Fit the thumbnail into 960×900 so the caption still fits inside Instagram's safe zone.
  const scale = Math.min(960 / thumb.width, 900 / thumb.height);
  // Unbounded runs wide, so these are a step smaller than Inter would need.
  const bySize = caption.length <= 50 ? 54 : caption.length <= 100 ? 46 : caption.length <= 180 ? 38 : 32;
  // Explicit line breaks mean "keep each line whole": shrink until the longest line fits the
  // panel's 880px text width (Unbounded averages ~0.72em per character).
  const longest = Math.max(...caption.split('\n').map((l) => l.length));
  const fontSize = caption.includes('\n') ? Math.max(32, Math.min(bySize, Math.floor(880 / (longest * 0.72)))) : bySize;

  return h(
    'div',
    // Padding keeps the centred group between Instagram's top bar (~y 230) and reply box (~y 1700).
    { width: STORY.width, height: STORY.height, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '250px 60px 220px', fontFamily: 'Inter', color: '#fff', backgroundImage: `url(${bg})`, backgroundSize: `${STORY.width}px ${STORY.height}px` },
    ...(logo ? [{ type: 'img', props: { src: `data:image/png;base64,${logo.png.toString('base64')}`, width: logo.width, height: logo.height, style: { marginBottom: 56 } } }] : []),
    {
      type: 'img',
      props: {
        src: `data:image/png;base64,${thumb.png.toString('base64')}`,
        width: Math.round(thumb.width * scale),
        height: Math.round(thumb.height * scale),
        style: { borderRadius: 24, border: BORDER, boxShadow: '0 12px 40px rgba(0,0,0,0.55)' },
      },
    },
    h(
      'div',
      { marginTop: 48, alignSelf: 'stretch', display: 'flex', justifyContent: 'center', padding: '32px 40px 36px', borderRadius: 20, background: brand.panel, border: BORDER, textAlign: 'center', whiteSpace: 'pre-wrap', fontFamily: 'Unbounded', fontWeight: 600, fontSize, lineHeight: 1.3 },
      caption,
    ),
  );
}

export async function composeCustom(backgroundPng, thumb, caption, brand, logo) {
  const svg = await satori(customTree(backgroundPng, thumb, caption, brand, logo), { width: STORY.width, height: STORY.height, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: 'width', value: STORY.width } }).render().asPng();
}
