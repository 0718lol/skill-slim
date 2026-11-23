# Antigravity

- **Source:** `src/adapters/antigravity.ts` · **Test:** `tests/gemini-adapter.test.ts`
- **Detection:** `~/.gemini/antigravity` exists. Antigravity shares `~/.gemini`
  with Gemini CLI. Gemini CLI is only detected from files that Antigravity does
  not write (`settings.json`, `extensions/`, `skills/`, `tmp/`, OAuth files).

## Skills

- `~/.gemini/config/skills/<name>/SKILL.md`: user skills
- `<cwd>/.agent/skills`, `<cwd>/.agents/skills`: workspace skills
- `~/.gemini/config/plugins/<plugin>/skills/`: **only** for plugins listed in
  `~/.gemini/config/config.json` → `plugins`. Entries with `enabled: false` or
  `disabled: true` are skipped. Plugin folders missing from the list are counted
  in a note and skipped. If `config.json` can't be read, every plugin folder is counted.
- `~/.gemini/antigravity/builtin/skills/` and `builtin/plugins/*/skills/`: ship
  with the app. They count as bundled (`plugin`) skills, so they are never offered for quarantine.

## Always-on instructions

- Rules in `~/.gemini/config/rules/`, `<cwd>/.agent(s)/rules/` and in each installed
  plugin's `rules/`, but only those with frontmatter `trigger: always_on`.
  `model_decision`, `glob` and `manual` rules load on demand. They are counted in a note
  and not billed.
- If a plugin ships the same rule as both `.md` and `.mdc`, it is loaded once.
- `~/.gemini/GEMINI.md`, `<cwd>/GEMINI.md`

## Usage

Conversation databases at `~/.gemini/antigravity/conversations/*.db` (SQLite,
read-only). A skill counts as used **only** when the step log
(`steps.step_payload`) contains a `view_file` / `read_file` tool call on its `SKILL.md`.

Three kinds of SKILL.md mention do **not** count:

- **`gen_metadata`**: it holds the prompt, and the prompt's skill catalog lists
  every installed skill as `- name (…/SKILL.md): description`. Counting it once
  made every skill look used ~50 times.
- **Directory listings** (`find`, `ls`) that print SKILL.md paths.
- **Writes or edits** to a SKILL.md.

**Evidence-gated:** usage is marked available only after at least one real skill read is seen.
Conversation count = rows in `trajectory_meta`.

## Verify locally

```bash
node src/cli.ts --agent antigravity --verbose
```
