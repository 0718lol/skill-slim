# Windsurf

- **Source:** `src/adapters/windsurf.ts` · **Test:** `tests/new-adapters.test.ts`
- **Detection:** `~/.codeium/windsurf` or `<cwd>/.windsurf` exists.
- **Paths verified against** docs.devin.ai (Windsurf/Cascade docs, post-
  Cognition acquisition) — `.devin/` is the preferred modern layout,
  `.windsurf/` the legacy one; both are read and `.devin` wins on identical
  rule names.

## Skills (conditionally / manually invoked)

- `<cwd>/.windsurf/rules/*.md` and `<cwd>/.devin/rules/*.md` whose frontmatter
  `trigger:` (or legacy `activation:`) is **not** `always_on` — i.e.
  `manual`, `model_decision` and `glob` rules
- `~/.codeium/windsurf/global_workflows/*.md` — global workflows, manual
  slash-invoked, never auto-triggered
- `<cwd>/.windsurf/workflows/` and `<cwd>/.devin/workflows/` — project
  workflows

## Always-on instructions

- `~/.codeium/windsurf/memories/global_rules.md` — global, always on
- `<cwd>/.windsurfrules` — legacy single file, always on
- rules with `trigger: always_on` — billed with full file content
- `<cwd>/AGENTS.md` — root AGENTS.md is always on

## Usage

Windsurf does not log rule/workflow invocations locally — `usage unknown`.

## Edge cases covered by tests

- always_on rule → instructions; glob-triggered rule → skills
- `trigger` and legacy `activation` frontmatter keys both honored
- `.devin` rules discovered alongside `.windsurf`

## Verify locally

```bash
node src/cli.ts --agent windsurf --verbose
```
