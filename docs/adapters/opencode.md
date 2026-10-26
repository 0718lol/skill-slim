# opencode

- **Source:** `src/adapters/opencode.ts` · **Test:** `tests/new-adapters.test.ts`
- **Detection:** `~/.config/opencode` (XDG config) or `<cwd>/.opencode` exists.
- **Paths verified against** opencode.ai official docs (skills / rules /
  commands pages) and a local install.

## Skills

- `~/.config/opencode/skills/<name>/SKILL.md` — global
- `<cwd>/.opencode/skills/` — project
- **compatibility roots opencode also loads:** `~/.claude/skills/`,
  `~/.agents/skills/` (global) and their `<cwd>/` equivalents (project).
  These are the same physical directories other agents read — each agent's
  bill counts what *it* carries, and `fix` dedupes by path so a directory is
  quarantined exactly once.
- `~/.config/opencode/commands/*.md` and `<cwd>/.opencode/commands/*.md` —
  slash-invoked command prompts

## Always-on instructions

First match wins per category: global `~/.config/opencode/AGENTS.md`, falling
back to `~/.claude/CLAUDE.md`; project `<cwd>/AGENTS.md`, falling back to
`<cwd>/CLAUDE.md`.

## Usage

Session storage is SQLite at `~/.local/share/opencode/opencode*.db` (or
`$XDG_DATA_HOME/opencode/`), verified on a real database: legacy `part.data`
rows and 2.x `session_message.data` rows are scanned for
`skills/<name>/SKILL.md` references, windowed by `time_created` (unix ms).
Conversations = `session` rows with `time_updated` inside the window.
**Evidence-gated:** usage is "unknown" unless some payload actually mentions
the skill system. Not yet parsed: the file-based `storage/` JSON layout of
intermediate 1.x builds.

## Edge cases covered by tests

- own + compat roots all counted under opencode
- AGENTS.md preferred over the CLAUDE.md fallback in both scopes
- empty home reports not-detected

## Verify locally

```bash
node src/cli.ts --agent opencode --verbose
```
