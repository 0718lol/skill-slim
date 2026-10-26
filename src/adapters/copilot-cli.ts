import * as path from "node:path";
import type { AgentId, AgentScan } from "../types.ts";
import { exists } from "../util/fsx.ts";
import { loadContextFiles } from "./skill-loader.ts";

/**
 * GitHub Copilot CLI keeps its state under ~/.copilot. There is no local skill
 * store yet; the always-on context to bill is instruction files: personal
 * ~/.copilot/copilot-instructions.md and repository .github/copilot-instructions.md.
 */
export const copilotCliAdapter = {
  id: "copilot-cli" as AgentId,
  name: "Copilot CLI",
  hint: "~/.copilot",

  async detect(ctx: { home: string }): Promise<boolean> {
    return exists(path.join(ctx.home, ".copilot"));
  },

  async scan(ctx: { home: string; cwd: string; windowDays: number }): Promise<AgentScan> {
    const notes: string[] = [];
    const detected = (await this.detect({ home: ctx.home })) ||
      (await exists(path.join(ctx.cwd, ".github", "copilot-instructions.md")));
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

    const instructions = await loadContextFiles(this.id, [
      { file: path.join(ctx.home, ".copilot", "copilot-instructions.md"), label: "personal copilot-instructions.md" },
      { file: path.join(ctx.cwd, ".github", "copilot-instructions.md"), label: "repo .github/copilot-instructions.md" },
    ]);

    notes.push("no local skill store — only instruction files are billed");
    return {
      id: this.id,
      name: this.name,
      detected: true,
      skills: [],
      instructions,
      usage: new Map(),
      usageAvailable: false,
      conversationCount: 0,
      notes,
    };
  },
};
