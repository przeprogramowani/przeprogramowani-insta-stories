# Source

- Upstream: https://github.com/petergyang/no-ai-slop
- Commit: `000650b156983f5159695b441477f4e63b25dc85` (upstream commit date 2026-09-01)
- Vendored: 2026-10-18
- License: MIT, see `LICENSE` (copied from the upstream repository root)

## Files

Copied unchanged from upstream `skills/no-ai-slop/`: `SKILL.md`, `eval.md`, `agents/openai.yaml`.

## Runtime use

`src/copyedit.mjs` sends `SKILL.md` and `eval.md` (in that order) to the text model as the
copy-editing pass over the Story leads. The polished leads are cached under a hash of the full editor prompt (these files + the task),
so editing any of it re-runs the pass on the next generation.
