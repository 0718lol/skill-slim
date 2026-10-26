# Adapter docs

One file per agent adapter. If you are fixing a bug or adding a feature scoped
to a single agent, read that agent's file first — it tells you which source
file to edit, where the agent's data lives on disk, which edge cases the test
suite already covers, and how to verify your change locally.

Adding a new agent? Start with [NEW_ADAPTER.md](NEW_ADAPTER.md).

## Adapter index

| Adapter | Data sources | Source | Test |
|---|---|---|---|
| [Claude Code](claude-code.md) | skills dirs + plugin bundles + `CLAUDE.md` + session JSONL | `src/adapters/claude-code.ts` | `tests/claude-adapter.test.ts` |
| [Codex CLI](codex.md) | skills/prompts + plugin bundles + `AGENTS.md` + session JSONL | `src/adapters/codex.ts` | `tests/codex-adapter.test.ts` |
| [Gemini CLI](gemini-cli.md) | skills dirs + `GEMINI.md` + Antigravity SQLite | `src/adapters/gemini-cli.ts` | `tests/gemini-adapter.test.ts` |
| [Cursor](cursor.md) | `.mdc` rules + ai-tracking SQLite | `src/adapters/cursor.ts` | `tests/cursor-adapter.test.ts` |
| [opencode](opencode.md) | XDG skills/commands + compat roots + `AGENTS.md` | `src/adapters/opencode.ts` | `tests/new-adapters.test.ts` |
| [Windsurf](windsurf.md) | `.windsurf`/`.devin` rules & workflows + `~/.codeium/windsurf` | `src/adapters/windsurf.ts` | `tests/new-adapters.test.ts` |
| [Zed](zed.md) | `~/.agents/skills` + `~/.config/zed/AGENTS.md` | `src/adapters/zed.ts` | `tests/new-adapters.test.ts` |
| [Copilot CLI](copilot-cli.md) | `~/.copilot` instruction files | `src/adapters/copilot-cli.ts` | `tests/new-adapters.test.ts` |

## The contract

Every adapter implements the same two-method `Adapter` interface
(`src/types.ts`) and returns an `AgentScan`:

- **`detect({ home })`** — cheap existence check for the agent's home marker.
- **`scan({ home, cwd, windowDays })`** — full scan producing `skills`
  (things the model loads on demand), `instructions` (always-on context),
  `usage` (invocation counts when derivable), `usageAvailable` (see gating
  rule below), and `conversationCount`.

Shared helpers live in `src/adapters/skill-loader.ts`
(`loadSkillDirs`, `loadPromptFiles`, `loadContextFiles`) and
`src/util/sqlite-scan.ts` (`scanSqliteDbs` with evidence gating).

### The usage-gating rule

An adapter may only set `usageAvailable: true` when it has **positive
evidence** that skill invocations are actually recorded on this machine
(e.g. transcripts parsed, or a database that mentions the skill system).
"Found no usage in an empty log" must report **unknown**, never "all unused" —
otherwise every installed skill would be falsely condemned and quarantined.

## Testing

```bash
npm test                          # whole suite, zero deps, sub-second
node --test tests/new-adapters.test.ts
node src/cli.ts agents            # which agents were detected on this machine
node src/cli.ts --agent <id> --verbose
```
