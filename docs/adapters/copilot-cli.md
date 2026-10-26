# Copilot CLI

- **Source:** `src/adapters/copilot-cli.ts` · **Test:** `tests/new-adapters.test.ts`
- **Detection:** `~/.copilot` or `<cwd>/.github/copilot-instructions.md`.
- **Paths verified against** docs.github.com (Copilot CLI custom instructions)
  and a local `~/.copilot` install.

## Skills

None — Copilot CLI currently has no local skill store. The adapter exists to
bill its always-on context honestly.

## Always-on instructions

- `~/.copilot/copilot-instructions.md` — personal, always on
- `<cwd>/.github/copilot-instructions.md` — repository-wide

## Usage

No local invocation logs — `usage unknown`. Skills gain nothing from this
adapter; instruction files are what the monthly bill is made of.

## Edge cases covered by tests

- both instruction files billed with correct labels
- project-only detection via `.github/copilot-instructions.md`

## Verify locally

```bash
node src/cli.ts --agent copilot-cli --verbose
```
