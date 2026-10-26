# Zed

- **Source:** `src/adapters/zed.ts` · **Test:** `tests/new-adapters.test.ts`
- **Detection:** `~/.config/zed` or `<cwd>/.agents/skills` exists.
- **Paths verified against** Zed's in-repo docs (`docs/src/ai/skills.md`,
  `instructions.md`): since Zed v1.4, Skills replaced on-demand Rules.

## Skills

- `~/.agents/skills/<name>/SKILL.md` — global, **cross-agent standard root**,
  flat layout only (nested folders are not discovered, mirroring Zed)
- `<cwd>/.agents/skills/` — project

The same roots are read by opencode (and any other agent implementing the
standard), so a skill folder here can legitimately appear in several agents'
bills; `fix` quarantines a directory only once.

## Always-on instructions

`~/.config/zed/AGENTS.md` (personal), `<cwd>/AGENTS.md` (project). Zed also
reads project `CLAUDE.md` / `GEMINI.md` / `AGENT.md` / `.rules` compat files —
billed under their primary agents rather than double-counted here.

## Usage

Agent threads live in a SQLite database (`threads/threads.db` under Zed's app
data dir) — parsing is on the roadmap (`usage unknown` for now).

## Edge cases covered by tests

- skills found in the cross-agent root with the shared-dir note
- global `~/.config/zed/AGENTS.md` billed as instructions
- empty home reports not-detected

## Verify locally

```bash
node src/cli.ts --agent zed --verbose
```
