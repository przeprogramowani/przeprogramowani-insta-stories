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
];

// Tiny hyperscript helper so the layout reads like markup without a JSX build step.
const h = (type, style, ...children) => ({ type, props: { style, children: children.flat() } });

const PANEL = 'rgba(14, 16, 30, 0.82)';

/** Template layout (badge, header band, "W tym wydaniu:", 3 lead cards) over the background, branded per newsletter. */
export function storyTree(backgroundPng, leads, brand) {
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
          h('div', { fontWeight: 400, fontSize: 35, lineHeight: 1.35, marginTop: 12, color: '#e4e8f5' }, l.text),
        ),
      ),
    ),
  );
}

export async function composeStory(backgroundPng, leads, brand) {
  const svg = await satori(storyTree(backgroundPng, leads, brand), { width: STORY.width, height: STORY.height, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: 'width', value: STORY.width } }).render().asPng();
}
