# Adding a new agent adapter

An adapter is one file in `src/adapters/` implementing `detect()` + `scan()`,
one test file, and one doc. The whole pipeline (report, fix/restore,
dashboard, CI gates) works off the shared `AgentScan` shape, so a new agent
needs no changes anywhere else beyond registration.

## 1. Verify the agent's on-disk layout

Do not guess paths — confirm them against the agent's official docs or, better,
a real machine that has the agent installed with skills/rules in place. Note
three things:

1. **Skills / conditionally-loaded content** — where skill folders or rule
   files live, globally and per-project, and whether other agents' roots are
   compatibility-loaded (see [opencode.md](opencode.md) for an example).
2. **Always-on instructions** — instruction/rules files loaded into *every*
   conversation (CLAUDE.md-style memories, always-apply rules).
3. **Usage evidence** — where (and whether) the agent logs skill invocations
   or at least conversation counts locally.

## 2. Create the adapter

Copy the closest existing adapter as a starting point:

- markdown rules with frontmatter → `cursor.ts` or `windsurf.ts`
- `SKILL.md` folders → `gemini-cli.ts`, `zed.ts`
- flat prompt files → `codex.ts`
- instruction files only (no skill store) → `copilot-cli.ts`

Use the shared helpers from `skill-loader.ts`; only drop to `node:sqlite`
(via `src/util/sqlite-scan.ts`) when the agent logs usage to a database.

Respect the **usage-gating rule** in [README.md](README.md): report
`usageAvailable: true` only with positive evidence the skill system is logged.

## 3. Register it

1. Add the id to the `AgentId` union in `src/types.ts`.
2. Import and add the adapter to `ADAPTERS` in `src/adapters/index.ts`.
3. Add it to the `--agent` list in `src/cli.ts` `printHelp()`.
4. Add a row to the "What gets scanned" table in `README.md`.

## 4. Test it

Fixture-based tests build a fake home with `fs.mkdtempSync` — see
`tests/new-adapters.test.ts` for the pattern. Cover at minimum:

- detected with skills/instructions loaded from the right roots
- not-detected on an empty home
- the usage path: either parsed counts, or the evidence gate holding on an
  empty log (unknown, not "unused")

```bash
npm test
node src/cli.ts agents          # then, on a machine that really runs the agent:
node src/cli.ts --agent <id> --verbose
```

## 5. Document it

Add `docs/adapters/<id>.md` (structure: Detection / Skills / Always-on
instructions / Usage / Edge cases / Verify locally) and a row in the index
table in `docs/adapters/README.md`. Paths in the doc must state their source
(official docs vs. verified on a real machine) — this is what keeps community
adapters trustworthy as agents change their layouts.
