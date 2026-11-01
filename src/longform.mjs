import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchText } from './http.mjs';
import { decode, htmlToText } from './sources/rss.mjs';

const MIN_CHARS = 500;

/** The article itself, without the page around it: <article>, else <main>, else <body>, minus site chrome. */
function articleFromHtml(html) {
  const title = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ') ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const body = html.match(/<article[\s>][\s\S]*<\/article>/i)?.[0] ?? html.match(/<main[\s>][\s\S]*<\/main>/i)?.[0] ?? html.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? html;
  const text = htmlToText(body.replace(/<(script|style|nav|header|footer|aside|form|noscript|svg)[\s>][\s\S]*?<\/\1>/gi, ''));
  return { title, text };
}

function fromPlainText(raw, fallbackTitle) {
  const text = raw.trim();
  const heading = text.match(/^#\s+(.+)$/m)?.[1] ?? text.split('\n')[0];
  return { title: (heading || fallbackTitle).trim().slice(0, 120), text };
}

/**
 * Any long-form input → { title, text, origin }. `input` is an http(s) URL, a local file (.md, .txt, .html…),
 * `clipboard` (macOS), `-` (stdin), or the text itself.
 */
export async function loadLongform(input) {
  let result;
  if (/^https?:\/\/\S+$/.test(input)) {
    result = { ...articleFromHtml(await fetchText(input, { accept: 'text/html,*/*' })), origin: input };
  } else if (input === 'clipboard') {
    result = { ...fromPlainText(execFileSync('pbpaste', { encoding: 'utf8', maxBuffer: 1 << 26 }), 'Schowek'), origin: 'clipboard' };
  } else if (input === '-') {
    result = { ...fromPlainText(readFileSync(0, 'utf8'), 'stdin'), origin: 'stdin' };
  } else if (input.length < 4096 && existsSync(input) && statSync(input).isFile()) {
    const ext = extname(input).toLowerCase();
    if (['.pdf', '.docx', '.pptx', '.epub'].includes(ext)) throw new Error(`Can't read ${ext} directly. Convert ${input} to text or Markdown first.`);
    const raw = readFileSync(input, 'utf8');
    result = { ...(['.html', '.htm'].includes(ext) ? articleFromHtml(raw) : fromPlainText(raw, basename(input))), origin: basename(input) };
  } else {
    if (input.length < MIN_CHARS) throw new Error(`"${input.slice(0, 80)}" isn't a URL or an existing file, and it's too short to be the content itself`);
    result = { ...fromPlainText(input, 'Tekst'), origin: 'pasted text' };
  }
  if (result.text.length < MIN_CHARS) {
    throw new Error(`Only ${result.text.length} characters of text from ${result.origin}. That's too little for a carousel; a JavaScript-rendered or paywalled page often looks like this, so paste the text instead.`);
  }
  return result;
}
