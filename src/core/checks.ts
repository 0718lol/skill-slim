import type { AgentReport, AgentScan, Finding } from "../types.ts";
import { similarity } from "../util/similarity.ts";
import { billPer1000Requests, estimateTokens, PRICE_PER_MTOK } from "../util/tokens.ts";

const DUPLICATE_THRESHOLD = 0.6;
const DESCRIPTION_CHAR_LIMIT = 1024;
const BODY_LINE_LIMIT = 500;
const BODY_TOKEN_LIMIT = 5000;

export function runChecks(scan: AgentScan, windowDays = 30): AgentReport {
  const findings: Finding[] = [];

  // 1. Always-on context bill: instruction files + every skill description.
  const instructionTokens = scan.instructions.reduce((sum, f) => sum + estimateTokens(f.content), 0);
  const descriptionTokens = scan.skills.reduce((sum, s) => sum + estimateTokens(s.description), 0);
  const alwaysOn = instructionTokens + descriptionTokens;
  if (scan.detected && alwaysOn > 0) {
    const heavy = scan.skills
      .map((s) => ({ name: s.name, tokens: estimateTokens(s.description) }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 3)
      .filter((s) => s.tokens > 0)
      .map((s) => `${s.name} (~${s.tokens} tok)`);
    findings.push({
      agent: scan.id,
      kind: "token-bill",
      severity: alwaysOn > 8000 ? "warn" : "info",
      title: `Always-on context: ~${alwaysOn.toLocaleString()} tokens`,
      detail:
        `instructions ~${instructionTokens.toLocaleString()} tok + ${scan.skills.length} skill descriptions ` +
        `~${descriptionTokens.toLocaleString()} tok` +
        (heavy.length ? `; heaviest: ${heavy.join(", ")}` : ""),
      paths: [],
      recoverableTokens: 0,
    });
  }

  // 2. Duplicate / overlapping skills. Overlaps purely inside plugin bundles
  // are informational — the user can't merge those, only uninstall the plugin.
  for (let i = 0; i < scan.skills.length; i++) {
    for (let j = i + 1; j < scan.skills.length; j++) {
      const a = scan.skills[i];
      const b = scan.skills[j];
      const sim = similarity(`${a.name} ${a.description}`, `${b.name} ${b.description}`);
      if (sim >= DUPLICATE_THRESHOLD) {
        const bundled = isBundled(a) && isBundled(b);
        findings.push({
          agent: scan.id,
          kind: "duplicate",
          severity: bundled ? "info" : "warn",
          title: `"${a.name}" overlaps "${b.name}" (${Math.round(sim * 100)}% similar)`,
          detail: bundled
            ? "Both ship inside plugin bundles; if they fight for triggers, uninstall one of the plugins."
            : "Both will compete for the same triggers; keep one or merge them.",
          paths: [a.path, b.path],
          recoverableTokens: Math.min(estimateTokens(a.description), estimateTokens(b.description)),
        });
      }
    }
  }

  // 3. Unused skills (only when usage data is available).
  if (scan.usageAvailable) {
    for (const skill of scan.skills) {
      const stat = scan.usage.get(skill.name.toLowerCase());
      if (!stat || stat.count === 0) {
        const bundled = isBundled(skill);
        findings.push({
          agent: scan.id,
          kind: "unused",
          severity: bundled ? "info" : "warn",
          title: `"${skill.name}" (${skill.source}) never invoked in the scan window`,
          detail: bundled
            ? "A bundled skill that never fires; uninstall the plugin if you don't need it."
            : "Its description still rides along in every conversation. Consider quarantining it.",
          paths: [skill.path],
          recoverableTokens: estimateTokens(skill.description),
        });
      }
    }
  }

  // 4. Convention checks.
  for (const skill of scan.skills) {
    if (!skill.description.trim()) {
      findings.push({
        agent: scan.id,
        kind: "convention",
        severity: "error",
        title: `"${skill.name}" has no description`,
        detail: "Without a description the agent cannot decide when to load this skill.",
        paths: [skill.path],
      });
    } else if (skill.description.length > DESCRIPTION_CHAR_LIMIT) {
      findings.push({
        agent: scan.id,
        kind: "convention",
        severity: "warn",
        title: `"${skill.name}" description is ${skill.description.length} chars (limit ${DESCRIPTION_CHAR_LIMIT})`,
        detail: "Shorten the description; it is loaded into context on every conversation.",
        paths: [skill.path],
      });
    }
    const bodyLines = skill.body.split("\n").length;
    const bodyTokens = estimateTokens(skill.body);
    if (bodyLines > BODY_LINE_LIMIT || bodyTokens > BODY_TOKEN_LIMIT) {
      findings.push({
        agent: scan.id,
        kind: "convention",
        severity: "warn",
        title: `"${skill.name}" body is large (${bodyLines} lines, ~${bodyTokens.toLocaleString()} tok)`,
        detail: "Move reference material into separate files loaded on demand (progressive disclosure).",
        paths: [skill.path],
      });
    }
    if (skill.dirName && skill.dirName.toLowerCase() !== skill.name.toLowerCase()) {
      findings.push({
        agent: scan.id,
        kind: "convention",
        severity: "info",
        title: `"${skill.name}" lives in a folder named "${skill.dirName}"`,
        detail: "Keep the frontmatter name and directory name aligned so usage stats and triggers stay unambiguous.",
        paths: [skill.path],
      });
    }
  }

  const score = computeScore(scan, findings, alwaysOn);
  const conversations = scan.conversationCount;
  const perConversation = (alwaysOn / 1_000_000) * PRICE_PER_MTOK;
  const monthlyCost = perConversation * conversations * (30 / windowDays);
  return {
    id: scan.id,
    name: scan.name,
    detected: scan.detected,
    skillCount: scan.skills.length,
    instructionCount: scan.instructions.length,
    alwaysOnTokens: alwaysOn,
    billPer1000: billPer1000Requests(alwaysOn),
    conversations,
    monthlyCost,
    findings,
    score,
    notes: scan.notes,
  };
}

function computeScore(scan: AgentScan, findings: Finding[], alwaysOn: number): number {
  if (!scan.detected) return 100;
  let score = 100;
  // informational findings (plugin-bundled issues) don't count against the
  // user — they can only act on skills and plugins they own
  const actionable = findings.filter((f) => f.severity !== "info");
  const duplicates = actionable.filter((f) => f.kind === "duplicate").length;
  const unused = actionable.filter((f) => f.kind === "unused").length;
  const errors = actionable.filter((f) => f.kind === "convention" && f.severity === "error").length;
  const warns = actionable.filter((f) => f.kind === "convention" && f.severity === "warn").length;
  score -= duplicates * 6;
  score -= Math.min(unused * 3, 15);
  score -= Math.min(errors * 8 + warns * 4, 24);
  if (alwaysOn > 12000) score -= 12;
  else if (alwaysOn > 8000) score -= 6;
  return Math.max(0, Math.min(100, score));
}

function isBundled(skill: { source: string }): boolean {
  return skill.source === "plugin" || skill.source === "extension";
}

export function grade(score: number): string {
  if (score >= 92) return "A";
  if (score >= 78) return "B";
  if (score >= 60) return "C";
  return "D";
}
