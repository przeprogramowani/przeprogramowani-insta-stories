---
name: carousel
description: Turn any long-form content (article URL, Markdown or text file, clipboard, pasted text) into a 5-slide vertical Instagram Reel (hook, problem, solution, deepening, call to action) with a procedurally generated dark blue and purple background, a track from Instagram's Audio API and a short caption with up to 5 hashtags, and submit it as an unpublished draft. Use when the user wants a Reel or carousel from long content, e.g. "zrób karuzelę z tego artykułu", "zrób rolkę z tego tekstu", "turn this post into a Reel". Excludes: Stories (use custom-story or the weekly pipeline), publishing an existing video file (use the reel skill).
argument-hint: <url|file|clipboard|-|text> [newsletter]
---

# Carousel (5-slide Reel with audio)

Wraps `node src/cli.mjs carousel <newsletter> <source>`, `audio` and `carousel-publish` (`src/carousel.mjs`).
Input: `$ARGUMENTS`. If the source is missing, ask for it. The name is historical: the output is a Reel, because
Instagram's API can attach music to Reels only, not to feed carousels.

**A "draft" here is an unpublished Instagram container.** The Graph API has no drafts: the container is
not visible in the Instagram app or Meta Business Suite and expires after 24 hours. The durable draft is
`stories/carousels/<date>-<slug>/`, and `carousel-publish` recreates an expired container from it. Tell the
user this when you report a submitted draft, so they don't go looking for it in the app.

**Publishing is public and can't be silently undone.** Never run `carousel-publish` without an explicit
go-ahead for this Reel in this conversation.

## 1. Inputs

| Input | Rules |
|---|---|
| `newsletter` | `przeprogramowani` (default) or `opanuj-ai`; use `opanuj-ai` for opanuj.ai content. Picks the logo, CTA address, voice and IG account. The palette is the same for both. |
| `source` | `https://` URL, local file (absolute path; `.md`, `.txt`, `.html`), `clipboard`, `-` (stdin), or the text itself (500+ characters). Convert PDF, DOCX or EPUB to text first. For a transcript or anything long, prefer a file over a shell argument. |

The Reel is always in Polish, whatever the source language.

## 2. Preflight

```bash
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
set -a; . ./.env; set +a
for k in OPENROUTER_API_KEY META_ACCESS_TOKEN INSTAGRAM_USER_ID STORIES_S3_BUCKET STORIES_CDN_BASE; do printf '%s: %s chars\n' "$k" "$(grep -E "^$k=" .env | cut -d= -f2- | tr -d '\n' | wc -c)"; done
aws sts get-caller-identity --query Arn --output text | sed -E 's/[0-9]{12}/<acct>/'
which ffmpeg ffprobe
```

Never print secret values. A preview only needs `OPENROUTER_API_KEY` and `ffmpeg`. Submitting also needs the rest.

## 3. Preview

```bash
DRY_RUN=1 node src/cli.mjs carousel przeprogramowani /abs/path/article.md
```

This costs a few cents and takes about a minute. It prints the draft directory, the world, the seed, the video's
length and the caption. **Passing an existing source again overwrites that day's draft directory**, so pass the
directory to keep hand edits. **Read all 5 JPEGs** and check that:

- the text is complete, the Polish diacritics are right and nothing overflows,
- the hook title names the reader's problem, e.g. "Chaos w pracy z kilkoma agentami naraz?", not a fact about the product or its popularity such as GitHub stars,
- the art doesn't hurt legibility,
- every slide and point gives real value to someone with no context who hasn't read the source: a concrete piece of knowledge or a step to take. A list of names such as "5 technik: Context Engineering, Plan Mode, feedback loop…" is a table of contents and fails this. Terms appear only with a plain explanation of what they mean in practice,
- every claim is in the source. Compare numbers and names against it, because models do drift,
- the CTA is a real next step, and its address (`slides[4].url`, default `brand.url`) is where readers should go,
- the CTA text ends by asking for a comment with a question tied to the topic, plus a share, e.g. "A jaka technika jest kluczowa w twoim workflow z AI? Podziel się komentarzem i udostępnij znajomym". If it doesn't, write one in `draft.json`,
- the caption is short and punchy: 1-2 sentences, 150 characters at most without hashtags, then up to 5 hashtags people really search for.

## 4. Review and correct the text

The generator already runs a no-ai-slop pass, but it can still drift from the source or flatten the copy. Before showing
anything to the user, read `no-ai-slop/SKILL.md` and `no-ai-slop/eval.md` in this skill's directory (a link to the vendored skill, so there is one copy to update) and the Polish patterns in `POLISH_SLOP_PATTERNS` in `src/copyedit.mjs`. This step needs no separate skill call. Apply them to all the slide copy and the caption:

1. **Review:** use its Detect job first. Name each pattern, quote the line and compare the claim with the source.
2. **Correct:** use its Edit job, with the minimum effective edit, and write the fixes to `<dir>/draft.json`. Also fix spelling, grammar and Polish typography.
3. **Re-render for free:** `DRY_RUN=1 node src/cli.mjs carousel <newsletter> <dir>`, then look at the changed slides again.

Keep the limits from `LIMITS` in `src/carousel-copy.mjs`, add no facts from outside the source, and leave the hashtags alone unless they're made up. Text the user wrote or approved stays as it is: suggest a change there instead of making it.

Show the user the file paths, the slide copy, the caption and what the review changed.

Changes are free, because the draft directory replaces the source and no AI runs:

- **Copy or caption:** edit `<dir>/draft.json`, then `DRY_RUN=1 node src/cli.mjs carousel <newsletter> <dir>`.
  Limits are enforced from `LIMITS` in `src/carousel-copy.mjs`.
- **Another background:** add `RESEED=1`. `WORLD=flowField|terrain|contours|shards|constellation|caves` forces a look.

Keep Polish `draft.json` edits in the user's wording, and repeat the review in step 4 on any new copy you write.

## 5. Pick the track

```bash
node src/cli.mjs audio <newsletter>            # what's trending
node src/cli.mjs audio <newsletter> "lofi"     # search
DRY_RUN=1 AUDIO=<id> node src/cli.mjs carousel <newsletter> <dir>
```

**The user picks the track**: show them the list with the preview links, and don't choose one yourself. Tell them:

- Instagram can't preview a Reel with attached audio, and the API can't choose which part of the track plays. `reel.mp4` is silent, so the first time they hear the two together is on the published Reel.
- The list holds only audio cleared for third-party use, so it can differ from the app.
- `is_ads_eligible: false` tracks can't run as ads. For promotional posts, a royalty-free track is safer, because Meta's docs don't say whether commercial tracks are allowed.

A track shorter than the video is refused.

## 6. Submit as a draft

Once the user is happy with the preview and the track, run the same command on the directory, without `DRY_RUN`. Nothing
appears on the account:

```bash
node src/cli.mjs carousel <newsletter> stories/carousels/<date>-<slug>
```

It re-renders the same video, uploads it and the cover to S3 and creates the container. Instagram processes the video for
up to a few minutes, so use a Bash timeout of 600000 ms. Report the container id, the 24-hour window and the publish command.

## 7. Publish (only on an explicit go-ahead)

```bash
node src/cli.mjs carousel-publish <newsletter> stories/carousels/<date>-<slug>
```

Success ends with `[<newsletter>] Published Reel <mediaId> <permalink>`. Report both. A second run refuses
to post again unless `FORCE=1` is set.

## Failures

| Message | Meaning / action |
|---|---|
| `Only N characters of text` | JavaScript-rendered or paywalled page. Ask the user to paste the text or save it to a file. |
| `Carousel writer broke the limits twice` | Run it again, or set a stronger `TEXT_MODEL`. |
| `draft.json: …` | A hand edit broke a limit. Shorten that field. |
| `No track chosen` | Do step 5 first. |
| `… pick a longer track` | The track is shorter than the video. |
| `Graph … (#190)` / `OAuthException` | Meta token invalid or data access lapsed. See Secrets in `CLAUDE.md`. |
| `Graph … (#10)` / `(#200)` on the container | The Audio API docs ask for a User token, and ours is a Page token. Search works with it; if attaching doesn't, tell the user. |
| `Container ERROR` | Instagram couldn't fetch or accept the video. Check the `videoUrl` in `draft.json` plays. |
| aws errors | Nothing was submitted. Fix the aws CLI login. |
