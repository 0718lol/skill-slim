---
name: skill-slim
description: Health check and slim-down for AI coding agent skills, rules, plugins, and context files. Audits loaded skills across Claude Code, Codex CLI, Gemini CLI, and Cursor, calculates always-on token costs and dollar spend, detects duplicate and never-invoked skills, and safely quarantines dead-weight context.
metadata:
  version: 0.1.0
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

> Health check & slim-down for your AI coding agent's skills, plugins, and context files. Works across **Claude Code**, **Codex CLI**, **Gemini CLI**, and **Cursor**.

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

---

## Core Commands

### 1. Run Health Check & Audit
Perform a comprehensive scan across all installed coding agents:

```bash
node src/cli.ts
```

For structured machine-readable JSON output (ideal for automated agent analysis):
```bash
node src/cli.ts --json
```

Generate a shareable standalone HTML report:
```bash
node src/cli.ts --html report.html
```

Filter by specific agents or adjust the transcript inspection window (default 30 days):
```bash
node src/cli.ts --agent claude-code,gemini-cli --days 14
```

### 2. Check Supported & Installed Agents
List which agents are installed and detected on the local system:

```bash
node src/cli.ts agents
```

Supported adapters:
- **Claude Code**: `~/.claude/skills`, `CLAUDE.md`, and session JSONL transcripts.
- **Codex CLI**: `~/.codex/skills`, `AGENTS.md`, and exec tool calls.
- **Gemini CLI / Antigravity**: `~/.gemini/config/skills`, `GEMINI.md`, and Antigravity conversation DBs.
- **Cursor**: `.cursor/rules/*.mdc`, always-apply rules, and tracking DB.

### 3. Dry-Run Optimization Plan (Token & Dollar Savings)
Before making any changes, compute the optimization plan to see recoverable tokens:

```bash
node src/cli.ts fix
```

This previews:
- Unused or dead-weight skills identified within the scan window.
- Recoverable always-on tokens.
- Estimated monthly dollar savings based on observed conversation volume.

### 4. Apply Safe Quarantine (Slim Down)
Quarantine never-invoked skills to `~/.skill-slim/quarantine/` with a manifest:

```bash
node src/cli.ts fix --apply
```

> **Safety Invariant**:
> - Plugin-bundled skills are never moved or deleted (recommend uninstalling the plugin instead).
> - Only user-owned custom skills (global or project) are quarantined.
> - Every moved skill is cataloged in the quarantine manifest with timestamp and original path.

### 5. Restore Quarantined Skills
List all currently quarantined skills:

```bash
node src/cli.ts restore
```

Restore a specific skill back to its exact original directory:

```bash
node src/cli.ts restore <skill-name>
```

### 6. Launch Local Web Dashboard
Start the visual web interface on `http://127.0.0.1:7466`:

```bash
node src/cli.ts serve
```

---

## Output Metrics & Findings Interpretation

When analyzing the scan results, focus on:
1. **Health Score (0–100 / Grade A–F)**:
   - Evaluates description lengths (< 1,024 chars), body sizes, duplicate trigger overlap, and usage recency.
2. **Always-On Token Bill**:
   - Total tokens loaded on every turn, converted to USD cost per 1,000 conversations and monthly pace.
3. **Competing Triggers**:
   - Skills with overlapping descriptions that confuse the model's tool selection router.
4. **Actionable Recommendations**:
   - Always run dry-run `fix` first, report findings clearly to the user, and request confirmation before running `fix --apply`.
