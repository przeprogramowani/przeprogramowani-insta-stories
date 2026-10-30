---
name: reel
description: Publish a local video as an Instagram Reel with a caption (and optional cover image) on the Przeprogramowani account. Use when the user points to a movie/video file and a description and wants it posted, e.g. "wrzuć tego reela", "opublikuj rolkę z opisem", "post this video as a Reel". Excludes: Stories (use custom-story or the weekly pipeline), feed photo posts, editing or cutting the video itself.
argument-hint: <video path> <caption> [cover image]
---

# Reel

Wraps `node src/cli.mjs reel <newsletter> <video> "<caption>" [cover]` (`src/reel.mjs`). The command
probes the video with `ffprobe`, checks the Reels limits (3 s–15 min, ≤300 MB), writes an Instagram-friendly
MP4 to `stories/reels/` (gitignored) — H.264/AAC is only remuxed with `+faststart` (lossless), anything else
(HEVC, >60 fps, >1920 px) is re-encoded to H.264 1080 px wide, ≤30 fps — then uploads it to S3 under
`insta-stories/reels/` (`hostOnS3`) and publishes it as a Reel (`media_type=REELS`, shared to the grid).
No AI calls. Nothing is committed and it isn't recorded in `published.json`.

**Posting is public and can't be silently undone.** Always dry-run first and post only after the user
approves in this conversation.

## 1. Inputs

Invoked as `/reel <video path> <caption> [cover image]`; arguments: `$ARGUMENTS`. The first token
(or quoted string) is the video, an image path/URL at the very end is the cover, the rest is the caption.
If the video or the caption is missing, ask for it. Don't pick a video or write a caption yourself.

| Input | Rules |
|---|---|
| `newsletter` | `przeprogramowani` (default). There is one IG account, so this only picks the env var. |
| `video` | Absolute local path (`.mp4`, `.mov`, anything ffmpeg reads). 9:16 is best; other ratios get a warning. |
| `caption` | The user's text as-is plus up to 5 hashtags (see below), ≤2200 chars. `\n` breaks the line. If they ask you to write it, draft it and get an OK first. |
| `cover` | Optional image (path or https URL), cropped to 1080×1920. Without it Instagram uses a frame from the video. |

### Hashtags

Append **up to 5 SEO-first hashtags** to the user's caption, on a new line after a blank line
(`'<caption>\n\n#tag1 #tag2 …'`). Keep the user's own text unchanged. If the caption already has hashtags,
count them toward the 5 and only add what's missing.

- **Pick what people search for.** Instagram search matches the caption and hashtags against keywords,
  so a tag should name the topic the way a viewer would type it: `#kontrolawersji`, `#git`, `#programowanie`,
  `#sztucznainteligencja`, `#ai`.
- **Specific before broad.** Use 2–3 tags for the Reel's exact topic (taken from the caption and the video,
  e.g. a frame or its on-screen text) and 1–2 for the niche (`#programista`, `#it`). Skip generic engagement
  tags (`#viral`, `#fyp`, `#reels`, `#explore`) and tags that have nothing to do with the video.
- **Mostly Polish, since the audience is Polish.** Add English only for terms people search in English
  (`#ai`, `#git`, `#devops`). Write tags in lowercase, without diacritics or spaces (`#sztucznainteligencja`).
- Use no brand tag unless the user asks for one.

Show the full final caption, including the hashtags, in the dry-run summary so the user approves exactly
what gets posted.

## 2. Preflight

```bash
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
aws sts get-caller-identity --query Arn --output text | sed -E 's/[0-9]{12}/<acct>/'
for k in META_ACCESS_TOKEN INSTAGRAM_USER_ID STORIES_S3_BUCKET STORIES_CDN_BASE; do printf '%s: %s chars\n' "$k" "$(grep -E "^$k=" .env | cut -d= -f2- | tr -d '\n' | wc -c)"; done
```

Never print secret values.

## 3. Dry run

Quote the caption in **single quotes** (write `'` as `'\''`):

```bash
DRY_RUN=1 node src/cli.mjs reel przeprogramowani /abs/path/video.mp4 'Opis rolki\n#programowanie'
```

It prints `Wrote stories/reels/<name>.mp4: W×H, duration, fps, codecs, size` plus any warnings (aspect,
no audio). If a cover was given, Read `stories/reels/<name>-cover.jpg`. Optionally grab a frame to show
what will be posted: `ffmpeg -v error -ss 1 -i stories/reels/<name>.mp4 -frames:v 1 -y <scratchpad>/frame.jpg`.

Show the user: the file, its stats and warnings, the account, the exact caption with the hashtags. Ask for a go-ahead.

## 4. Post

Same command without `DRY_RUN`. Instagram processes the video for up to a few minutes (the command polls up
to 10 min). Run it with a Bash timeout of 600000 ms. Success ends with
`[przeprogramowani] Published Reel <mediaId> <permalink>` — report both.

## Failures

| Message | Meaning / action |
|---|---|
| `Video is N s` / `Prepared video is N MB` | Outside Reels limits; the user has to trim/compress. |
| `Container ERROR: …` | Instagram rejected the video. Check the printed URL plays; re-encoding usually fixes codec issues. |
| `Container … still IN_PROGRESS` | Processing took >10 min; nothing posted. Re-run (same file → same S3 key). |
| `Graph … (#190)` / `OAuthException` | Meta token invalid or data access lapsed; see Secrets in `CLAUDE.md`. |
| `Graph … (#10)` / `(#200)` permission | The token lacks `instagram_content_publish`; regenerate it. |
| aws errors | Nothing posted; fix the aws CLI login. |
