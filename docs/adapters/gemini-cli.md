# Gemini CLI

- **Source:** `src/adapters/gemini-cli.ts` · **Test:** `tests/gemini-adapter.test.ts`
- **Detection:** `~/.gemini` exists.

## Skills

- `~/.gemini/config/skills/<name>/SKILL.md` (newer layout) and
  `~/.gemini/skills/` (older layout) — both tried, deduped by path

## Always-on instructions

`~/.gemini/GEMINI.md`, `~/.gemini/config/GEMINI.md`, `<cwd>/GEMINI.md`,
`<cwd>/.gemini/GEMINI.md`, plus markdown files inside
`~/.gemini/extensions/<name>/` (≤ 30 files, depth 2) — extension context is
loaded whenever the extension is enabled.

## Usage

Antigravity conversation databases `~/.gemini/antigravity/conversations/*.db`
(SQLite, read-only via `node:sqlite`). Scans `steps.step_payload`,
`steps.metadata`, `gen_metadata.data` for `skills/<name>/SKILL.md` references.

**Evidence-gated:** `usageAvailable: true` only when some scanned payload
actually mentions the skill system. A database that never logs skills reads as
"usage unknown", never "all unused". Conversation count = rows in
`trajectory_meta`.

## Edge cases covered by tests

- DB with skill traces → usage parsed, unused skill flagged
- DB that never mentions skills → gate holds, no unused findings
- unreadable DBs decrement coverage instead of failing the scan

## Verify locally

```bash
node src/cli.ts --agent gemini-cli --verbose
```
