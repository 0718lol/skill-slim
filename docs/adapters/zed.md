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

Agent threads live in one SQLite database (`threads/threads.db` under Zed's
app-data dir: `~/Library/Application Support/Zed/` on macOS,
`~/.local/share/zed/` on Linux, `%LOCALAPPDATA%\Zed\` on Windows — layout per
Zed's serialization source and CodeBurn's provider docs). Each `threads.data`
row is the thread JSON — zstd-compressed on current Zed (`data_type="zstd"`,
decompressed with Node's built-in zlib; threads are skipped with a notice on
Node < 22.15), plain JSON on legacy rows. Threads are windowed by the
`updated_at` field inside the JSON. **Evidence-gated** like every adapter.

## Edge cases covered by tests

- skills found in the cross-agent root with the shared-dir note
- global `~/.config/zed/AGENTS.md` billed as instructions
- empty home reports not-detected

## Verify locally

```bash
node src/cli.ts --agent zed --verbose
```
