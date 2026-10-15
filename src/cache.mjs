import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

// Per-issue cache of the paid steps (leads, background). In GitHub Actions `.cache/` is persisted
// between runs with actions/cache, so a retry or the real run after a dry run reuses them —
// and the dry-run preview is exactly what gets posted. FRESH=1 ignores what's cached.
const ROOT = '.cache';

export function issueCache(newsletterKey, issueId) {
  const base = `${ROOT}/${newsletterKey}`;
  const id = createHash('sha1').update(issueId).digest('hex').slice(0, 12);
  const dir = `${base}/${id}`;
  const fresh = Boolean(process.env.FRESH);

  // Only the current issue is ever reused; drop older ones so the Actions cache stays small.
  if (existsSync(base)) for (const d of readdirSync(base)) if (d !== id) rmSync(`${base}/${d}`, { recursive: true, force: true });

  const read = (name) => (!fresh && existsSync(`${dir}/${name}`) ? readFileSync(`${dir}/${name}`) : null);
  const write = (name, data) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}`, data);
  };

  /** Return the cached value, or compute it, store it immediately, and return it. */
  return {
    async json(name, compute) {
      const hit = read(name);
      if (hit) return console.log(`Cache hit: ${name}`), JSON.parse(hit);
      const value = await compute();
      write(name, JSON.stringify(value, null, 2));
      return value;
    },
    async buffer(name, compute) {
      const hit = read(name);
      if (hit) return console.log(`Cache hit: ${name}`), hit;
      const value = await compute();
      write(name, value);
      return value;
    },
  };
}
