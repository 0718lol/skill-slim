# skill-slim

> Health check & slim-down for your AI coding agent's skills, plugins and context files.
> Works with **Claude Code · Codex CLI · Gemini CLI · Cursor**.

Every skill description and rules file you install rides along in **every** conversation.
Most setups carry dead weight: duplicated skills, prompts that never fire, oversized rule
files. skill-slim audits what your agent actually loads, prices it in tokens and dollars,
and safely quarantines the dead weight.

```
  skill-slim — agent context health check
  scanned: 4/4 agents installed · usage window 30d

  ● Codex CLI  [codex]
    skills: 5 · always-on instructions: 1 · always-on tokens: ~580 · ≈ $1.74 per 1k conversations
    · Always-on context: ~580 tokens
      instructions ~0 tok + 5 skill descriptions ~580 tok; heaviest: verify-engineering-work (~225 tok)
    health score: 100/100 (A)

  ──────────────────────────────────────────
  overall score: 100/100 (A) · always-on everywhere: ~580 tokens · recoverable: ~0 tokens
```

## Features

- 🩺 **Multi-agent** — one scan covers Claude Code, Codex CLI, Gemini CLI and Cursor
- 💸 **Always-on token bill** — every always-loaded byte, converted to tokens and an
  estimated USD cost per 1,000 conversations *and per month at your observed pace*
- 👯 **Duplicate detection** — flags skills whose descriptions overlap enough to compete
  for the same triggers
- 📉 **Never-invoked detection** — parses local session transcripts (Claude Code and
  Codex) to find skills that were not used once in the scan window
- 📋 **Convention checks** — missing descriptions, over-length descriptions (1,024-char
  limit), oversized bodies that break progressive disclosure, name/folder mismatches
- 🏥 **Health score** — 0–100 per agent, plus a shareable HTML report (`--html`)
- 🔒 **Reversible `fix` / `restore`** — quarantines never-invoked skills you own to
  `~/.skill-slim/quarantine/` with a manifest; dry-run shows the **upside first**
  (~N fewer always-on tokens ≈ $X/month), `--apply` re-scores and prints the
  before/after health delta; `restore <name>` moves them back. Plugin-bundled skills
  are never touched — uninstall the plugin instead
- 🧾 **Scannable reports** — actionable findings always surface; plugin-bundle noise
  collapses into a summary line (`--verbose` to expand)
- 🤖 **CI-ready** — `--min-score <n>` exits 1 when the health score drops below the gate
- 📦 **Zero runtime dependencies** — plain Node ≥ 22.6, no install step

## Usage

```bash
git clone https://github.com/<you>/skill-slim && cd skill-slim

node src/cli.ts                        # health check across all detected agents
node src/cli.ts agents                 # which agents were found on this machine
node src/cli.ts fix                    # dry-run: plan + upside (tokens & $ saved)
node src/cli.ts fix --apply            # quarantine, then re-score: 76 → 91
node src/cli.ts restore                # list quarantined skills
node src/cli.ts restore <name>         # move one back to its original location
node src/cli.ts --json                 # machine-readable output
node src/cli.ts --html report.html     # shareable HTML report card
node src/cli.ts --agent claude-code,codex --days 14
node src/cli.ts --verbose              # expand collapsed informational findings
```

CI gate — fail the build when your skills repo gets bloated:

```yaml
- run: node src/cli.ts --min-score 85
```

npm package (`npx skill-slim`) ships once the CLI is battle-tested — see roadmap.

## What gets scanned

| Agent | Skills | Always-on instructions | Usage data |
|---|---|---|---|
| Claude Code | `~/.claude/skills`, `.claude/skills`, plugin bundles | global & project `CLAUDE.md` | ✅ local `~/.claude/projects` transcripts |
| Codex CLI | `~/.codex/skills`, `~/.codex/prompts`, plugin bundles | global & project `AGENTS.md` | ✅ exec calls reading a `SKILL.md` + leading slash commands |
| Gemini CLI | `~/.gemini/config/skills`, `~/.gemini/skills` | global & project `GEMINI.md`, extensions | ✅ Antigravity conversation DBs, evidence-gated |
| Cursor | non-always-apply `.cursor/rules/*.mdc` | always-apply rules | conversations only (`ai-tracking`); rule usage isn't logged |

Everything stays on your machine: skill-slim reads local files only and makes no
network requests.

## Accuracy notes

- Token counts use a heuristic (CJK ≈ 1 token/char, other text ≈ 3.8 chars/token) —
  good for sizing, not billing-grade.
- Cost estimates assume $3 per 1M input tokens; adjust `PRICE_PER_MTOK` in
  `src/util/tokens.ts` to match your plan. The monthly figure extrapolates from the
  conversation count inside the scan window.
- Claude Code usage parsing is a best-effort regex over session JSONL; Codex usage is a
  proxy (exec calls reading a `SKILL.md`, leading slash commands) and only scans
  tool-call *inputs* — command outputs overcount wildly. Both may overcount, which is
  the safe direction: it only ever *protects* a skill from the unused list.
- Gemini usage is **evidence-gated**: Antigravity conversation databases are scanned
  (read-only, via Node's built-in `node:sqlite`) for `SKILL.md` path references. When a
  database never mentions the skill system, the report says "usage unknown" instead of
  falsely marking every skill unused.
- Cursor doesn't log rule invocations locally, so only conversation counts (from
  `~/.cursor/ai-tracking/ai-code-tracking.db`) are read — they power the monthly bill.
- `fix` only ever moves skills you own (global/project). Plugin-bundled skills live in
  agent-managed caches and are reported as informational — uninstall the plugin instead.

## Roadmap

- [x] `restore` command to un-quarantine by name
- [x] Usage parsing for Codex (exec-proxy + slash commands)
- [x] Usage parsing for Gemini CLI (Antigravity DBs, evidence-gated)
- [x] Conversation counts for Cursor's monthly bill
- [ ] Per-rule usage for Cursor (not logged locally by Cursor)
- [ ] Embedding-based duplicate detection (optional local model)
- [ ] MCP server tool-definition pricing
- [ ] GitHub Action that posts a health report on your skills repo
- [ ] `npm i -g skill-slim` / `npx skill-slim` distribution

## Contributing

PRs welcome — especially new agent adapters. An adapter is one file in `src/adapters/`
implementing `detect()` + `scan()`. Run tests with `npm test` (24 tests, no deps).

## 中文说明

skill-slim 给 AI 编码 Agent 的技能包做“体检”：统计常驻上下文的 token 成本、找出重复
与从未使用的技能、检查规范问题，并可一键隔离（可恢复）瘦身。支持 Claude Code / Codex /
Gemini CLI / Cursor 四家，纯本地运行，零依赖。用量解析覆盖 Claude Code（会话 JSONL）、
Codex（exec 调用代理）、Gemini CLI（Antigravity 会话库，证据门控）；Cursor 不记录规则
调用，仅读取会话数支撑月度账单。常用命令见上方 Usage；`fix` 默认 dry-run，加 `--apply`
才会实际移动目录到 `~/.skill-slim/quarantine/`，`restore <name>` 随时恢复。

## License

MIT
