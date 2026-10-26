# Cursor

- **Source:** `src/adapters/cursor.ts` · **Test:** `tests/cursor-adapter.test.ts`
- **Detection:** `~/.cursor` or `<cwd>/.cursor` exists.

## Skills (conditionally-invoked rules)

`~/.cursor/rules/*.mdc` (user) and `<cwd>/.cursor/rules/*.mdc` (project).
Rules with `alwaysApply: true` are **not** skills — they are counted as
always-on instructions below.

## Always-on instructions

Every rule whose frontmatter has `alwaysApply: true`, with the raw file
content billed in full.

## Usage

Cursor does not log rule invocations locally, so per-rule usage is genuinely
unknown (`usageAvailable: false`). The `ai-tracking` database
(`~/.cursor/ai-tracking/ai-code-tracking.db`) provides **conversation
counts**, which power the monthly always-on bill.

## Edge cases covered by tests

- always-apply rules land in instructions, the rest in skills
- global and project rule files dedupe identical paths
- missing tracking DB degrades to conversation count 0

## Verify locally

```bash
node src/cli.ts --agent cursor --verbose
```
