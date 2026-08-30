import type { Adapter, AgentScan, ScanContext } from "../types.ts";
import { claudeCodeAdapter } from "./claude-code.ts";
import { codexAdapter } from "./codex.ts";
import { geminiCliAdapter } from "./gemini-cli.ts";
import { cursorAdapter } from "./cursor.ts";

export const ADAPTERS: Adapter[] = [claudeCodeAdapter, codexAdapter, geminiCliAdapter, cursorAdapter];

export function resolveAdapters(selected?: string[]): Adapter[] {
  if (!selected || selected.length === 0) return ADAPTERS;
  const known = new Set(ADAPTERS.map((a) => a.id));
  for (const id of selected) {
    if (!known.has(id as Adapter["id"])) {
      throw new Error(`unknown agent "${id}" — available: ${[...known].join(", ")}`);
    }
  }
  return ADAPTERS.filter((a) => selected.includes(a.id));
}

export async function scanAgent(adapter: Adapter, ctx: ScanContext): Promise<AgentScan> {
  return adapter.scan(ctx);
}
