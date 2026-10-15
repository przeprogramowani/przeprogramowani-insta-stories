# przeprogramowani-insta-stories — agent guide

Publishes one Instagram Story per newsletter issue, every week, from GitHub Actions:

| Key | Newsletter | Source | Schedule (Europe/Warsaw) |
|---|---|---|---|
| `przeprogramowani` | Przeprogramowany Newsletter | Substack RSS `przeprogramowani.substack.com/feed.xml` | Sunday 09:00 (10:00 in summer) |
| `opanuj-ai` | Opanuj.AI Newsletter | MailerLite campaigns containing "Opanuj.AI" (same selection as opanuj.ai/newsletter) | Tuesday 09:00 (10:00 in summer) |

Plain Node 22 ESM (`.mjs`), no build step, no framework. Dependencies: `sharp`, `satori`,
`@resvg/resvg-js`, `fast-xml-parser`. User-facing setup is in `README.md`.

## Pipeline

```
newsletter.latest()  ─▶ writeLeads()          ─▶ generateBackground()     ─▶ composeStory()        ─▶ JPEG 1080×1920
(src/sources/*)        text model, 3 PL leads    image model, no text        Satori layout + fonts
                                                                                      │
GitHub Action: commit image ─▶ raw.githubusercontent.com URL ─▶ publishStory() (Graph API) ─▶ published.json
```

| Path | Responsibility |
|---|---|
| `src/newsletters.mjs` | **The only per-newsletter place**: source, `brand` (headline lines, URL, palette: badge/panel/accent/URL/body-text colours and the background prompt's `backgroundStyle` — Przeprogramowani is red, Opanuj.AI blue), editorial `voice` for the lead writer, which IG account env var to post with. |
| `src/sources/substack.mjs` (RSS → JSON API fallback), `rss.mjs`, `mailerlite.mjs`; `src/http.mjs` (browser-like fetch + retries) | Return the latest issue as `{ id, title, subtitle, link, text, publishedAt }`. `text` is the full issue as plain text — the lead writer depends on it. `id` must be stable (dedupe key). |
| `src/leads.mjs` | Text model (`TEXT_MODEL`, default `openai/gpt-5.4-mini`) → exactly 3 `{ title ≤40, text ≤140 chars }` in Polish, JSON mode. |
| `src/background.mjs` | Image model (`IMAGE_MODEL`, default `openai/gpt-5.4-image-2`) → dark tech/space 9:16 background, **no text**. |
| `src/layout.mjs` | The template: "NOWE WYDANIE" badge, header band (headline + URL), "W tym wydaniu:" pill, 3 lead cards. Satori + bundled fonts in `assets/fonts/`. |
| `src/instagram.mjs` | Graph API: create `STORIES` container from a public JPEG URL → poll → `media_publish`. |
| `src/cache.mjs` | Per-issue cache of the paid steps (`leads.json`, `background.png`) in `.cache/<newsletter>/<issue-hash>/`, persisted across runs with `actions/cache` (restore newest `story-<newsletter>-*`, save under the run id, even on failure). Only the current issue is kept. The background file is keyed by a hash of `brand.backgroundStyle`, so palette changes regenerate automatically. `FRESH=1` / the `fresh` input bypasses it. |
| `src/cli.mjs` | `generate <newsletter>` / `publish <newsletter> <url>`; writes `stories/<key>/<date>-<slug>.jpg` + `.pending.json`; records published issues in `published.json`. |
| `relay/` | Cloudflare Worker relaying allow-listed feeds — Substack serves GitHub runners a Cloudflare challenge. Requires `Authorization: Bearer <FEED_RELAY_TOKEN>` (Worker secret `RELAY_TOKEN`). Deploy: `cd relay && npx wrangler@latest deploy` (Node 22). |
| `.github/workflows/story.yml` | Reusable pipeline (generate → artifact → commit → publish → record). |
| `.github/workflows/<key>.yml` | Thin schedule + manual-dispatch callers, one per newsletter. |

## Design decisions — keep them unless the user asks otherwise

- **AI never renders text.** Models only write the leads (as data) and paint the background; all
  text is drawn by `layout.mjs`. Image models misspell Polish diacritics — don't "simplify" by
  asking the image model for the whole Story.
- **Layout follows the user's template** (badge top-left, dark header band, pill, three cards).
  Keep content clear of Instagram's UI: nothing important above y≈230 or below y≈1700.
- **Instagram needs a public JPEG URL** — no direct upload. That's why the Action commits the image
  and the repo must stay **public**. Use the commit-SHA raw URL (immutable), not `main`.
- **One Story per issue.** `published.json` is the dedupe log; `FORCE=1` / the `force` input
  overrides it. Generated images stay in git history on purpose (they're the hosting).
- **One UTC cron per newsletter** (08:00 UTC): GitHub crons have no time zone, so the local time
  shifts by an hour with DST (09:00 Warsaw in winter, 10:00 in summer). That's accepted on purpose.
- **Manual runs default to `dry_run`** (image attached as an artifact, nothing posted).
- **Pay once per issue.** Leads and background are cached per issue, so retries and the real run
  after a dry run reuse them — the dry-run preview is exactly what gets posted. Only the layout is
  re-rendered (free), so layout changes apply without new AI calls. Use `fresh` for a new take.

## Adding or changing a newsletter

1. Add an entry to `NEWSLETTERS` in `src/newsletters.mjs`. A new source type goes in
   `src/sources/` and must return the shape above.
2. Copy `.github/workflows/przeprogramowani.yml` → `<key>.yml`, change name, cron weekday and
   `newsletter:`. Keep `permissions: contents: write` (reusable workflows can't exceed the caller).
3. New secrets → declare them under `workflow_call.secrets` in `story.yml` and pass via `env`.
4. A newsletter-specific template (the user plans one for Opanuj.AI): prefer extending `brand`
   (colours, headline, badge text) and branching in `layout.mjs` on a `brand.layout` key over
   forking the whole file.

## Verifying changes

Use Node 22 — the default shell node (20.6) can't load `sharp`:

```bash
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
```

- **Layout only (free, no API calls):** render `composeStory()` with a solid-colour background and
  dummy leads that include `ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ` and a long two-line sentence, then **look at the
  PNG** (Read the image). Check the badge doesn't cover the headline and nothing overflows the cards.
- **Full generation (costs a few cents, ~1 min):** `FORCE=1 node src/cli.mjs generate <key>` with
  `.env` loaded, then look at `stories/<key>/…jpg`. Delete test outputs (or move one to `examples/`)
  before committing — `stories/` is what the Action publishes.
- **Publishing** only happens in Actions. To test end to end, run the workflow manually with
  `dry_run` off — that posts a real Story, so ask the user first.
- Syntax check: `for f in src/*.mjs src/sources/*.mjs; do node --check "$f"; done`.

## Secrets — rules for agents

- Local `.env` (gitignored) and GitHub repository secrets use the same names: `OPENROUTER_API_KEY`,
  `META_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `MAILERLITE_API_KEY`, `FEED_RELAY_TOKEN`, optional
  `OPANUJ_AI_INSTAGRAM_USER_ID`.
- **Never print secret values.** Check presence by length; redact tokens in output.
- The user pastes secrets and runs `gh secret set -f .env --repo przeprogramowani/przeprogramowani-insta-stories`.
- `META_ACCESS_TOKEN` is a non-expiring Meta **Page** token. Meta's data-access window must be
  renewed every 90 days; after regenerating, update this repo's GitHub secret too.
- **This repo is public.** Account names, emails, local paths, other repos and renewal dates belong
  in `CLAUDE.local.md` (gitignored), never in tracked files, commit messages or workflow logs.
- Posting a Story is public and can't be silently undone: never trigger a non-dry run without the
  user's go-ahead.

## Maintenance checklist

- **Run failed** → open the Action log; the failing step names the stage.
  - `OpenRouter 4xx` → model id renamed/retired (`curl -s https://openrouter.ai/api/v1/models`
    lists ids with `output_modalities` containing `image`) or key/credits.
  - `Graph … (#190)` / `OAuthException` → Meta token invalid or data access lapsed → regenerate.
  - `Container ERROR` → Instagram couldn't fetch/accept the image (must be JPEG, 9:16, public URL).
  - `MailerLite 401` → wrong key; `No sent MailerLite campaign matching` → naming changed.
- **Run "succeeded" but nothing posted** → the issue was
  already in `published.json` (`skip=true` in the generate step).
- **Leads complain about missing content** → the source returned a stub. MailerLite's `plain_text` is only the "can't display HTML" notice; the issue is `emails[0].content` from `GET /campaigns/{id}`. `writeLeads` refuses texts under 500 chars and model replies with `{"error"}`.
- **Lead quality drifts** → tune the prompt in `src/leads.mjs` (rules are in Polish on purpose) or
  the newsletter's `voice`; keep the length limits — the cards are sized for them.
