// Some hosts (Substack behind Cloudflare) reject Node's default User-Agent from datacenter IPs
// such as GitHub Actions runners, so fetch like a browser and retry transient failures.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  'Accept-Language': 'pl,en;q=0.8',
};

export async function fetchText(url, { accept = '*/*', attempts = 3 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: accept } });
    const body = await res.text();
    if (res.ok) return body;
    last = `${url}: ${res.status} ${body.replace(/\s+/g, ' ').slice(0, 160)}`;
    if (res.status < 500 && res.status !== 403 && res.status !== 429) break;
    if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
  }
  throw new Error(last);
}

export const fetchJson = async (url) => JSON.parse(await fetchText(url, { accept: 'application/json' }));
