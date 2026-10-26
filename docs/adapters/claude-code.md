# Claude Code

- **Source:** `src/adapters/claude-code.ts` · **Test:** `tests/claude-adapter.test.ts`
- **Detection:** `~/.claude` exists.

## Skills

- `~/.claude/skills/<name>/SKILL.md` — global
- `<cwd>/.claude/skills/` — project
- plugin bundles: every `skills/` directory found under `~/.claude/plugins`
  (depth ≤ 5), marked `plugin` (reported, never quarantined)

## Always-on instructions

`~/.claude/CLAUDE.md`, `<cwd>/CLAUDE.md`, `<cwd>/.claude/CLAUDE.md`.

## Usage

Session transcripts in `~/.claude/projects/<escaped-cwd>/*.jsonl`, filtered by
mtime to the scan window (≤ 2000 files, 10 MB each, 500 MB total). Lines
containing `"Skill"` are matched for `"command":"…"` tool_use inputs and
`"skill":"…"` mentions. `usageAvailable: true` when at least one session file
was parsed — **no sessions found means unknown, not unused.**

Conversation count = session files inside the window.

## Edge cases covered by tests

- plugin-bundled skills are informational, never quarantineable
- global and project skill roots dedupe identical paths
- fixture home drives both detection and usage parsing

## Verify locally

```bash
node src/cli.ts --agent claude-code --verbose
```
