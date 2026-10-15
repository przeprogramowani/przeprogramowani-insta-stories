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
    latest: () => latestFromSubstack({ host: 'przeprogramowani.substack.com' }),
    brand: {
      headline: ['Przeprogramowany', 'Newsletter'],
      url: 'przeprogramowani.pl/newsletter',
      badge: '#e53935',
      urlColor: '#cfe0ff',
      accent: 'rgba(140, 170, 255, 0.28)',
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
      badge: '#6d28d9',
      urlColor: '#c7d2fe',
      accent: 'rgba(129, 140, 248, 0.32)',
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
