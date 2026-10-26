import { latestFromSubstack } from './sources/substack.mjs';
import { latestFromMailerlite } from './sources/mailerlite.mjs';

/**
 * One entry per newsletter: where the latest issue comes from, how the Story is branded,
 * and which Instagram account it goes to. The pipeline (leads → background → layout → publish)
 * is shared.
 */
export const NEWSLETTERS = {
  przeprogramowani: {
    name: 'Przeprogramowany Newsletter',
    latest: () =>
      latestFromSubstack({
        host: 'przeprogramowani.substack.com',
        relayUrl: 'https://przeprogramowani-feed-relay.przeprogramowani.workers.dev/feeds/przeprogramowani.xml',
      }),
    brand: {
      headline: ['Przeprogramowany', 'Newsletter'],
      url: 'przeprogramowani.pl/newsletter',
      // White wordmark, shown above the thumbnail in ad-hoc Stories (src/custom.mjs).
      logo: 'assets/logos/przeprogramowani-white.png',
      // Red-ish identity.
      badge: '#e53935',
      panel: 'rgba(28, 8, 12, 0.84)',
      accent: 'rgba(255, 99, 99, 0.38)',
      urlColor: '#ffc9c9',
      bodyText: '#f6e6e6',
      backgroundStyle:
        'near-black with deep crimson, burgundy and dark red tones, glowing red and warm orange circuit traces and grid lines, ember-like particles, a faint red nebula haze',
    },
    voice: 'Przeprogramowany Newsletter (Przeprogramowani: Przemek Smyrdek i Marcin Czarkowski) — programowanie, AI i branża IT',
    instagramUserIdEnv: 'INSTAGRAM_USER_ID',
  },
  'opanuj-ai': {
    name: 'Opanuj.AI Newsletter',
    latest: () => latestFromMailerlite({ titleFilter: 'Opanuj.AI', exclude: [/Make\.com test/i] }),
    brand: {
      headline: ['Opanuj.AI', 'Newsletter'],
      url: 'opanuj.ai/newsletter',
      // Blue-ish identity (opanuj.ai primary #1e40af).
      badge: '#1e40af',
      panel: 'rgba(6, 14, 36, 0.84)',
      accent: 'rgba(96, 165, 250, 0.40)',
      urlColor: '#bfdbfe',
      bodyText: '#e3ecfb',
      backgroundStyle:
        'near-black with deep navy, royal and electric blue tones, glowing cyan and blue circuit traces and grid lines, small stars, a faint blue nebula haze',
    },
    voice: 'Newsletter Opanuj.AI (Przemek Smyrdek i Marcin Czarkowski) — najlepsze zasoby o AI dla programistów',
    // Defaults to the same account; set OPANUJ_AI_INSTAGRAM_USER_ID to post to a separate one.
    instagramUserIdEnv: process.env.OPANUJ_AI_INSTAGRAM_USER_ID ? 'OPANUJ_AI_INSTAGRAM_USER_ID' : 'INSTAGRAM_USER_ID',
  },
};

export function getNewsletter(key) {
  const nl = NEWSLETTERS[key];
  if (!nl) throw new Error(`Unknown newsletter "${key}". Known: ${Object.keys(NEWSLETTERS).join(', ')}`);
  return { key, ...nl };
}
