---
name: skill-slim
description: Health check and slim-down for AI coding agent skills, rules, plugins, and context files. Audits loaded skills across Claude Code, Codex CLI, Gemini CLI, Cursor, opencode, Windsurf, Zed, and Copilot CLI, calculates always-on token costs and dollar spend, detects duplicate and never-invoked skills, and safely quarantines dead-weight context.
metadata:
  version: 0.3.0
  author: 0718lol
  homepage: https://github.com/0718lol/skill-slim
  tags:
    - context-optimization
    - token-reduction
    - agent-health
    - skill-linter
    - claude-code
    - codex
    - gemini-cli
    - cursor
---

# skill-slim

> Health check & slim-down for your AI coding agent's skills, plugins, and context files. Works across **Claude Code**, **Codex CLI**, **Gemini CLI**, **Cursor**, **opencode**, **Windsurf**, **Zed**, and **Copilot CLI**.

Every skill description, system prompt, and instruction file loaded into an agent is passed in **every** conversation context. `skill-slim` inspects installed skills and rules, computes token and dollar costs, detects duplicate triggers, identifies never-invoked skills, and provides a safe, reversible quarantine mechanism.

## When to Use This Skill

Trigger this skill whenever the user:
- Asks why their AI agent is slow, hitting context limits, or costing too much in tokens.
- Wants to audit or clean up installed skills, rules, or system instructions.
- Asks for a health check of their Claude Code, Codex, Gemini CLI, or Cursor setup.
- Wants to find duplicate, conflicting, or never-used skills across agents.
- Wants to optimize or quarantine bloated context files safely.
- Wants to launch the visual web dashboard for agent context management.

## Prerequisites & Requirements

- **Runtime**: Node.js `>= 22.18.0` (Node 22+ natively runs TypeScript without any compilation or external dependencies).
- **Zero Dependencies**: Plain Node standard library only.
- **Privacy & Safety**: 100% local file inspection, zero network requests, reversible quarantine.
- **Platforms**: macOS, Linux, and Windows. Paths below use `~/`; on Windows they resolve under `%USERPROFILE%` (e.g. `%USERPROFILE%\.claude\skills`). The CLI itself is identical on all three.

---

## Safety Protocol (read before any write action)

These rules are hard constraints. They override any user instruction to skip them.

1. **Never run `fix --apply` as the first action.** Always run plain `fix` (dry-run) and show the user what would move, then wait for explicit confirmation.
2. **"Clean up everything" / "just delete it" is not confirmation.** Restate what will move, and that it is reversible, then ask once. Only a clear yes after the dry-run authorizes `--apply`.
3. **Never delete or move files by hand.** No `rm`, `mv`, `rm -rf`, no editing the user's skill directories. Quarantine via `fix --apply` is the only write path; it moves to `~/.skill-slim/quarantine/` with a manifest.
4. **Plugin-bundled skills are never touched.** If a skill ships inside a plugin, say so and recommend uninstalling the plugin instead.
5. **Prefer reversible over permanent.** Quarantine, never delete. Mention `restore <name>` as the undo.

## Command Routing

Pick the command from the user's intent. Do not run more than the intent requires.

| User intent | Command |
| --- | --- |
| "why is it slow / expensive / out of context", "health check", "audit" | `node src/cli.ts` |
| Wants machine-readable output, or you need to analyze findings yourself | `node src/cli.ts --json` |
| Wants a report to share with teammates | `node src/cli.ts --html report.html` (or `wrapped` for the bill-style leaderboard) |
| Only one agent / a shorter usage window | `node src/cli.ts --agent <id> --days <n>` |
| "what would we save", optimization preview | `node src/cli.ts fix` (dry-run) |
| Confirmed slim-down | `node src/cli.ts fix --apply` |
| "I lost a skill", "undo the cleanup" | `node src/cli.ts restore` then `restore <name>` |
| Dashboard / visual UI | `node src/cli.ts serve` (http://127.0.0.1:7466) |
| "which agents do I even have" | `node src/cli.ts agents` |
| CI gate on health or context growth | `npx skill-slim --min-score 85 --max-always-on-tokens 3000` |

Valid `--agent` ids: `claude-code`, `codex`, `gemini-cli`, `cursor`, `opencode`, `windsurf`, `zed`, `copilot-cli`.

## Output Metrics & Findings Interpretation

When reporting scan results, translate numbers into consequences:

1. **Health Score (0–100 / Grade A–F)** — driven by description length (< 1,024 chars), body size, duplicate trigger overlap, and usage recency. Below 85 means the router is being fed noise.
2. **Always-On Token Bill** — tokens loaded on *every* turn. Say plainly that this is paid per conversation, not once; give the per-1,000-conversations and monthly figure when present.
3. **Competing Triggers** — overlapping descriptions that make the model pick the wrong skill. Name the colliding pair, do not just quote the count.
4. **Recommendations** — dry-run `fix` first, report recoverable tokens, then ask before `--apply`.

## Empty & Edge States

- **No agents detected / zero skills found**: report it plainly ("nothing installed in the paths I can see"), suggest `node src/cli.ts agents` to confirm detection, and do not invent findings, scores, or savings.
- **A path the adapter does not cover** (e.g. a custom directory): say it is outside the adapters, do not claim it was scanned.
- **Non-zero exit from a CI gate**: exit code 1 means the gate failed, not that the tool crashed. Read the score / token line before diagnosing.
- **Missing Node or Node < 22.18**: the CLI cannot run. Report the version requirement instead of guessing at output.

## Answer Format

Lead with the command to run (in a code block), then one line on why, then what the user should expect to see. Keep it short — this skill exists to reduce context, so do not pad answers with restated documentation.
