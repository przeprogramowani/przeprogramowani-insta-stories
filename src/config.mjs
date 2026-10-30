import { existsSync, readFileSync } from 'node:fs';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';

// Node gives each IPv6/IPv4 address 250 ms to connect; on a slow link or a dead IPv6 route every attempt times out
// ("fetch failed") while curl works. Give each address a few seconds.
setDefaultAutoSelectFamilyAttemptTimeout(5000);

// Local runs read .env; in GitHub Actions the same names come from repository secrets.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const IMAGE_MODEL = process.env.IMAGE_MODEL ?? 'openai/gpt-5.4-image-2';
export const TEXT_MODEL = process.env.TEXT_MODEL ?? 'openai/gpt-5.4-mini';
// Copy-edit pass (src/copyedit.mjs): short output, so a stronger model costs ~4 cents per issue; mini ignores half the rules.
export const EDIT_MODEL = process.env.EDIT_MODEL ?? 'anthropic/claude-sonnet-5.5';
export const GRAPH = 'https://graph.facebook.com/v23.0';

/** Story canvas required by Instagram (9:16). */
export const STORY = { width: 1080, height: 1920 };

export function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (set it in .env locally or as a GitHub Actions secret)`);
  return v;
}

/**
 * OpenRouter chat completion; returns the first choice's message. Image generations take ~1 min and
 * the connection occasionally drops mid-response (undici: "terminated"), so retry network errors,
 * 429 and 5xx.
 */
export async function openrouter(body, { attempts = 3 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${required('OPENROUTER_API_KEY')}`,
          'Content-Type': 'application/json',
          'X-Title': 'przeprogramowani-insta-stories',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = new Error(`OpenRouter ${res.status}: ${JSON.stringify(json.error ?? json)}`);
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      const message = json.choices?.[0]?.message;
      if (!message) throw Object.assign(new Error(`OpenRouter returned no message: ${JSON.stringify(json).slice(0, 500)}`), { retryable: true });
      return message;
    } catch (e) {
      // fetch/body errors (TypeError "terminated"/"fetch failed", timeouts) have no `retryable` flag.
      const retryable = e.retryable ?? true;
      const detail = e.cause ? `${e.message} (${e.cause.code ?? e.cause.message ?? e.cause})` : e.message;
      if (!retryable || i >= attempts) throw new Error(`${body.model}: ${detail}`);
      console.warn(`OpenRouter attempt ${i}/${attempts} failed: ${detail} — retrying`);
      await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
}
