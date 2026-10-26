import * as path from "node:path";
import type { AgentId, AgentScan, ContextFile, Skill } from "../types.ts";
import { exists, listFiles, readFileSafe } from "../util/fsx.ts";
import { parseFrontmatter } from "../util/frontmatter.ts";
import { loadPromptFiles } from "./skill-loader.ts";

/**
 * Windsurf (Cascade) lives under ~/.codeium/windsurf. Always-on context:
 * memories/global_rules.md, the legacy .windsurfrules file, root AGENTS.md and
 * workspace rules with trigger: always_on. Rules with manual / model_decision /
 * glob triggers behave like conditionally-invoked skills; workflows (global
 * global_workflows/, project .windsurf/workflows/) are manual slash-invoked.
 * .devin/ paths are the preferred modern layout, .windsurf/ the legacy one —
 * both are read, .devin wins on identical rule names.
 */
export const windsurfAdapter = {
  id: "windsurf" as AgentId,
  name: "Windsurf",
  hint: "~/.codeium/windsurf",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".codeium", "windsurf"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const wsDir = path.join(ctx.home, ".codeium", "windsurf");
    const notes: string[] = [];
    const detected = (await this.detect({ home: ctx.home })) || (await exists(path.join(ctx.cwd, ".windsurf")));
    if (!detected) {
      return {
        id: this.id,
        name: this.name,
        detected: false,
        skills: [],
        instructions: [],
        usage: new Map(),
        usageAvailable: false,
        conversationCount: 0,
        notes,
      };
    }

    const instructions: ContextFile[] = [];
    const globalRules = await readFileSafe(path.join(wsDir, "memories", "global_rules.md"));
    if (globalRules !== null) {
      instructions.push({
        agent: this.id,
        label: "global rules (memories/global_rules.md)",
        path: path.join(wsDir, "memories", "global_rules.md"),
        content: globalRules,
      });
    }
    const legacy = await readFileSafe(path.join(ctx.cwd, ".windsurfrules"));
    if (legacy !== null) {
      instructions.push({
        agent: this.id,
        label: "project .windsurfrules (legacy, always-on)",
        path: path.join(ctx.cwd, ".windsurfrules"),
        content: legacy,
      });
    }
    const agentsMd = await readFileSafe(path.join(ctx.cwd, "AGENTS.md"));
    if (agentsMd !== null) {
      instructions.push({
        agent: this.id,
        label: "project AGENTS.md (always-on)",
        path: path.join(ctx.cwd, "AGENTS.md"),
        content: agentsMd,
      });
    }

    const skills: Skill[] = [];
    // rule files keyed by rule name; .devin (modern) overrides .windsurf (legacy)
    const ruleFiles = new Map<string, { file: string; source: "global" | "project" }>();
    for (const file of await listFiles(path.join(ctx.cwd, ".windsurf", "rules"), ".md")) {
      ruleFiles.set(path.basename(file, ".md"), { file, source: "project" });
    }
    for (const file of await listFiles(path.join(ctx.cwd, ".devin", "rules"), ".md")) {
      ruleFiles.set(path.basename(file, ".md"), { file, source: "project" });
    }
    for (const { file, source } of ruleFiles.values()) {
      const raw = await readFileSafe(file);
      if (raw === null) continue;
      const { data, body } = parseFrontmatter(raw);
      const name = data.name || path.basename(file, ".md");
      if (isAlwaysOn(data)) {
        instructions.push({
          agent: this.id,
          label: `${source} rule (always_on) ${path.basename(file)}`,
          path: file,
          content: raw,
        });
      } else {
        skills.push({
          agent: this.id,
          name,
          dirName: name,
          description: data.description || "",
          body,
          path: file,
          source,
        });
      }
    }

    skills.push(
      ...(await loadPromptFiles(this.id, path.join(wsDir, "global_workflows"))),
      ...(await loadPromptFiles(this.id, path.join(ctx.cwd, ".windsurf", "workflows"), "project")),
      ...(await loadPromptFiles(this.id, path.join(ctx.cwd, ".devin", "workflows"), "project")),
    );

    notes.push("usage unknown — Windsurf does not log rule/workflow invocations locally");
    return {
      id: this.id,
      name: this.name,
      detected: true,
      skills,
      instructions,
      usage: new Map(),
      usageAvailable: false,
      conversationCount: 0,
      notes,
    };
  },
};

/** Rules declare activation via `trigger:` (current docs) or `activation:` (older). */
function isAlwaysOn(data: Record<string, unknown>): boolean {
  const raw = data.trigger ?? data.activation;
  if (typeof raw !== "string") return false;
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_") === "always_on";
}
