---
name: custom-story
description: Render an ad-hoc 9:16 Instagram Story from a thumbnail (local path or https URL) and a short caption, preview it, and post it to the Przeprogramowani or Opanuj.AI Instagram account right away. Use when the user wants to post a one-off Story with an image and a note, e.g. "wrzuć story z tą miniaturką", "opublikuj relację z dopiskiem", "zrób story z tego obrazka", "post this thumbnail as a Story". Excludes: the weekly newsletter Stories (those run from GitHub Actions via `cli.mjs generate`), feed posts, Reels and video.
---

# Custom Story

Wraps `node src/cli.mjs custom <newsletter> <image> "<caption>"` (`src/custom.mjs`). The command renders
the thumbnail as a card over its own blurred copy with the caption in a panel below, in the chosen
newsletter's colours, with the brand logo (if it has one) above the thumbnail. No AI calls, so it costs
nothing. The JPEG lands in `stories/custom/` (gitignored). Without `DRY_RUN=1` it uploads the JPEG to S3
(`hostOnS3` in `src/hosting.mjs`, public through CloudFront) and posts it to Instagram immediately.
Nothing is committed to git.

**Posting is public and can't be silently undone.** Always preview first and post only after the user
approves that preview in this conversation.

## 1. Collect the inputs

| Input | Rules |
|---|---|
| `newsletter` | `przeprogramowani` (red, default) or `opanuj-ai` (blue). Picks the colours and the IG account. Ask only if the context doesn't make it clear. |
| `image` | Local path (make it absolute) or an `https://` URL. Any format `sharp` reads (JPEG, PNG, WebP…). For YouTube thumbnails, `https://i.ytimg.com/vi/<id>/maxresdefault.jpg` works. |
| `caption` | Polish unless the user says otherwise, ≤280 chars; 50–120 reads best. `\n` breaks the line. Use the user's wording as-is. If they ask you to write it, draft one and get their OK before rendering. |

## 2. Preflight

Run from the repo root, with Node 22 (the default shell node can't load `sharp`):

```bash
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
aws sts get-caller-identity --query Arn --output text | sed -E 's/[0-9]{12}/<acct>/'   # aws CLI logged in
for k in META_ACCESS_TOKEN INSTAGRAM_USER_ID STORIES_S3_BUCKET STORIES_CDN_BASE; do printf '%s: %s chars\n' "$k" "$(grep -E "^$k=" .env | cut -d= -f2- | tr -d '\n' | wc -c)"; done
```

Never print secret values; check them by length only. If a variable is missing or `aws` isn't logged in,
stop and tell the user what's missing (the bucket and CDN base come from the user; see `.env.example`).

## 3. Preview (dry run)

Quote the caption in **single quotes** so `$`, `!` and backticks stay literal. Write a `'` as `'\''`.

```bash
DRY_RUN=1 node src/cli.mjs custom przeprogramowani /abs/path/thumb.png 'Nowy odcinek już jest!\nLink w bio'
```

It prints `Wrote stories/custom/<date>-<slug>.jpg`. **Read that image** and check that:
- the caption is complete, the Polish diacritics are right and nothing overflows the panel,
- the thumbnail isn't cropped badly or too small (a very tall image gets narrow),
- nothing important sits above y≈250 or below y≈1700 (Instagram's UI covers those areas).

Show the user the preview path, the account it will go to and the exact caption, then ask for an
explicit go-ahead. If they want changes, re-run the dry run with the new inputs.

## 4. Post

Only after the user approves, run the same command without `DRY_RUN`. It re-renders the same image,
uploads it to S3, waits until the CDN URL answers and publishes:

```bash
node src/cli.mjs custom przeprogramowani /abs/path/thumb.png 'Nowy odcinek już jest!\nLink w bio'
```

Success ends with `[<newsletter>] Published Story <mediaId> (<url>)`. Report the media id and the
CDN URL.

The preview stays in `stories/custom/` (gitignored); delete it if the user declines.

## Failures

| Message | Meaning / action |
|---|---|
| `Missing STORIES_S3_BUCKET` / `STORIES_CDN_BASE` | Ask the user for the values and add them to `.env` (never to tracked files). |
| `aws` error (`AccessDenied`, `Unable to locate credentials`, expired token) | Nothing was posted. The user has to log in or fix the aws CLI credentials. |
| `Uploaded, but … is not reachable — nothing was posted` | The file is in S3 but the CDN doesn't serve it. Open the URL; if it starts answering, publish it with `node -e "import('./src/instagram.mjs').then(m => m.publishStory('<url>'))"`. Pass `'OPANUJ_AI_INSTAGRAM_USER_ID'` as the second argument when the account is opanuj-ai and that secret is set. Re-running the command is also safe: the same image gets the same S3 key. |
| `Graph … (#190)` / `OAuthException` | The Meta token is invalid or its data access lapsed. The user has to regenerate it; see the Secrets section in `CLAUDE.md`. |
| `Container ERROR` | Instagram couldn't fetch the image. Check that the printed URL opens. |
| `Caption is N chars` | Shorten it with the user. |
