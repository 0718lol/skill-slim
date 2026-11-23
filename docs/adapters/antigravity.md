# Antigravity

- **Source:** `src/adapters/antigravity.ts` · **Test:** `tests/gemini-adapter.test.ts`
- **Detection:** `~/.gemini/antigravity` exists. Antigravity shares `~/.gemini`
  with Gemini CLI. Gemini CLI is only detected from files that Antigravity does
  not write (`settings.json`, `extensions/`, `skills/`, `tmp/`, OAuth files).

## Skills

- `~/.gemini/config/skills/<name>/SKILL.md`: user skills
- `<cwd>/.agent/skills`, `<cwd>/.agents/skills`: workspace skills
- `~/.gemini/config/plugins/<plugin>/skills/` (both `<name>/SKILL.md` and flat root `SKILL.md`): **only** for plugins listed in
  `~/.gemini/config/config.json` → `plugins`. Entries with `enabled: false` or
  `disabled: true` are skipped. Plugin folders missing from the list are counted
  in a note and skipped. If `config.json` can't be read, every plugin folder is counted.
- `~/.gemini/antigravity/builtin/skills/` and `builtin/plugins/*/skills/`: app-builtin
  skills gated by mode/feature flags (not unconditionally injected into the prompt
  catalog). They are counted in a note and not billed.

## Always-on instructions

- Rules in `~/.gemini/config/rules/`, `<cwd>/.agent(s)/rules/` and in each installed
  plugin's `rules/` that are always active: frontmatter `trigger: always_on`,
  `alwaysApply: true`, or standalone markdown rules without frontmatter triggers
  (such as `AGENTS.md`). `model_decision`, `glob` and `manual` rules load on demand;
  they are counted in a note and not billed.
- If a plugin ships the same rule as both `.md` and `.mdc`, it is deduplicated by
  stem (`.md` wins) so neither always-on nor on-demand rules are double-counted.
- `~/.gemini/GEMINI.md`, `<cwd>/GEMINI.md`

## Usage

Conversation databases at `~/.gemini/antigravity/conversations/*.db` (SQLite,
read-only). A skill counts as used **only** when the step log
(`steps.step_payload`) contains a `view_file` / `read_file` tool call on its `SKILL.md`
(matching regardless of JSON key order and supporting both `skills/<name>/SKILL.md`
and flat `plugins/<plugin>/skills/SKILL.md`). Reads of other agents' skill directories
(such as `~/.codex/` or `~/.claude/`) are ignored.

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
