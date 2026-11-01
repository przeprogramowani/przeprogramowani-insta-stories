---
name: carousel
description: Turn any long-form content (article URL, Markdown or text file, clipboard, pasted text) into a 5-slide Instagram feed carousel (hook, problem, solution, deepening, call to action) with a procedurally generated dark blue and purple background, and submit it as an unpublished draft. Use when the user wants a carousel from long content, e.g. "zrób karuzelę z tego artykułu", "przerób ten tekst na karuzelę", "turn this post into a carousel". Excludes: Stories (use custom-story or the weekly pipeline), Reels and video (use the reel skill).
argument-hint: <url | file | clipboard | text> [przeprogramowani | opanuj-ai]
---

# Carousel

Wraps `node src/cli.mjs carousel <newsletter> <source>` and `carousel-publish` (`src/carousel.mjs`).
Input: `$ARGUMENTS`. If the source is missing, ask for it.

**A "draft" here is an unpublished Instagram container.** The Graph API has no drafts: the container is
not visible in the Instagram app or Meta Business Suite and expires after 24 hours. The durable draft is
`stories/carousels/<date>-<slug>/`, and `carousel-publish` recreates an expired container from it. Tell the
user this when you report a submitted draft, so they don't go looking for it in the app.

**Publishing is public and can't be silently undone.** Never run `carousel-publish` without an explicit
go-ahead for this carousel in this conversation.

## 1. Inputs

| Input | Rules |
|---|---|
| `newsletter` | `przeprogramowani` (default) or `opanuj-ai`. Picks the logo, CTA address, voice and IG account. The palette is the same for both. |
| `source` | `https://` URL, local file (absolute path; `.md`, `.txt`, `.html`), `clipboard`, `-` (stdin), or the text itself (500+ characters). Convert PDF, DOCX or EPUB to text first. For a transcript or anything long, prefer a file over a shell argument. |

The carousel is always in Polish, whatever the source language.

## 2. Preflight

```bash
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
for k in OPENROUTER_API_KEY META_ACCESS_TOKEN INSTAGRAM_USER_ID STORIES_S3_BUCKET STORIES_CDN_BASE; do printf '%s: %s chars\n' "$k" "$(grep -E "^$k=" .env | cut -d= -f2- | tr -d '\n' | wc -c)"; done
aws sts get-caller-identity --query Arn --output text | sed -E 's/[0-9]{12}/<acct>/'
```

Never print secret values. A preview only needs `OPENROUTER_API_KEY`. Submitting also needs the rest.

## 3. Preview

```bash
DRY_RUN=1 node src/cli.mjs carousel przeprogramowani /abs/path/article.md
```

This costs a few cents and takes about a minute. It prints the draft directory, the world, the seed and the
caption. **Read all 5 JPEGs** and check that:

- the text is complete, the Polish diacritics are right and nothing overflows,
- the art doesn't hurt legibility,
- every claim is in the source. Compare numbers and names against it, because models do drift,
- the CTA is a real next step, and its address (`slides[4].url`, default `brand.url`) is where readers should go.

Show the user the file paths, the slide copy and the caption.

Changes are free, because the draft directory replaces the source and no AI runs:

- **Copy or caption:** edit `<dir>/draft.json`, then `DRY_RUN=1 node src/cli.mjs carousel <newsletter> <dir>`.
  Limits are enforced from `LIMITS` in `src/carousel-copy.mjs`.
- **Another background:** add `RESEED=1`. `WORLD=flowField|terrain|contours|shards|constellation|caves` forces a look.

Keep Polish `draft.json` edits in the user's wording, and run new copy you write past the `no-ai-slop` skill.

## 4. Submit as a draft

Once the user is happy with the preview, run the same command on the directory, without `DRY_RUN`. Nothing
appears on the account:

```bash
node src/cli.mjs carousel przeprogramowani stories/carousels/<date>-<slug>
```

It re-renders the same images, uploads them to S3 and creates the container. Report the container id, the
24-hour window and the publish command.

## 5. Publish (only on an explicit go-ahead)

```bash
node src/cli.mjs carousel-publish przeprogramowani stories/carousels/<date>-<slug>
```

Success ends with `[<newsletter>] Published carousel <mediaId> <permalink>`. Report both. A second run refuses
to post again unless `FORCE=1` is set.

## Failures

| Message | Meaning / action |
|---|---|
| `Only N characters of text` | JavaScript-rendered or paywalled page. Ask the user to paste the text or save it to a file. |
| `Carousel writer broke the limits twice` | Run it again, or set a stronger `TEXT_MODEL`. |
| `draft.json: …` | A hand edit broke a limit. Shorten that field. |
| `Graph … (#190)` / `OAuthException` | Meta token invalid or data access lapsed. See Secrets in `CLAUDE.md`. |
| `Container ERROR` | Instagram couldn't fetch an image. Check the URLs in `draft.json` open. |
| aws errors | Nothing was submitted. Fix the aws CLI login. |
