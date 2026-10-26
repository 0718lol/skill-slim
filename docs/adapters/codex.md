# Codex CLI

- **Source:** `src/adapters/codex.ts` · **Test:** `tests/codex-adapter.test.ts`
- **Detection:** `~/.codex` exists.

## Skills

- `~/.codex/skills/<name>/SKILL.md` — global
- `~/.codex/prompts/*.md` — custom prompts, invoked as leading slash commands;
  counted as individually-invoked skills
- plugin bundles under `~/.codex/plugins` (depth ≤ 6), marked `plugin`

## Always-on instructions

`~/.codex/AGENTS.md`, `<cwd>/AGENTS.md`.

## Usage

Codex loads a skill by shelling out to read its `SKILL.md`, so exec tool-call
**inputs** mentioning `…/skills/<name>/SKILL.md` are the invocation proxy;
leading `/command` messages count prompt invocations. Command *outputs* are
deliberately not scanned (they overcount wildly). Sessions are JSONL under
`~/.codex/sessions`, mtime-windowed. `usageAvailable: true` when at least one
session file parsed.

## Edge cases covered by tests

- exec-proxy parsing counts skill reads, not output echoes
- slash-command invocations are attributed to prompt names
- plugin bundles informational; `fix` never touches them

## Verify locally

```bash
node src/cli.ts --agent codex --verbose
```
