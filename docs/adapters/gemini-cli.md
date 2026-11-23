# Gemini CLI

- **Source:** `src/adapters/gemini-cli.ts` · **Test:** `tests/gemini-adapter.test.ts`
- **Detection:** finds a file that only Gemini CLI writes under `~/.gemini`: `settings.json`,
  `extensions/`, `skills/`, `tmp/`, `oauth_creds.json` or `google_accounts.json`.
  `~/.gemini` on its own is not enough, because Antigravity keeps its data there
  too. See [antigravity.md](antigravity.md).

## Skills

- `~/.gemini/skills/<name>/SKILL.md` and `<cwd>/.gemini/skills/`

## Always-on instructions

`~/.gemini/GEMINI.md`, `<cwd>/GEMINI.md` and `<cwd>/.gemini/GEMINI.md`, plus markdown files
inside `~/.gemini/extensions/<name>/` (at most 30 files, at most 2 levels deep). An
extension's context is loaded whenever that extension is enabled.

## Usage

Gemini CLI doesn't keep a local log of skill calls that skill-slim can read, so usage is
reported as unknown. No skill is ever called unused.

> Older versions read Antigravity's conversation databases here and counted every
> SKILL.md path they found. Those paths were mostly the skill catalog in the prompt,
> so the counts came out inflated. Antigravity now has its own adapter.

## Verify locally

```bash
node src/cli.ts --agent gemini-cli --verbose
```
