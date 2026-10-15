import { existsSync, readFileSync } from 'node:fs';

// Local runs read .env; in GitHub Actions the same names come from repository secrets.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const IMAGE_MODEL = process.env.IMAGE_MODEL ?? 'openai/gpt-5.4-image-2';
export const TEXT_MODEL = process.env.TEXT_MODEL ?? 'openai/gpt-5.4-mini';
export const GRAPH = 'https://graph.facebook.com/v23.0';

/** Story canvas required by Instagram (9:16). */
export const STORY = { width: 1080, height: 1920 };

export function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (set it in .env locally or as a GitHub Actions secret)`);
  return v;
}

/** OpenRouter chat completion; returns the first choice's message. */
export async function openrouter(body) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'X-Title': 'przeprogramowani-insta-stories',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error(`OpenRouter returned no message: ${JSON.stringify(json).slice(0, 500)}`);
  return message;
}
