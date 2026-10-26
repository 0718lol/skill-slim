import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { opencodeAdapter } from "../src/adapters/opencode.ts";
import { windsurfAdapter } from "../src/adapters/windsurf.ts";
import { zedAdapter } from "../src/adapters/zed.ts";
import { copilotCliAdapter } from "../src/adapters/copilot-cli.ts";
import { planFix } from "../src/fix.ts";
import type { AgentScan } from "../src/types.ts";

function writeSkill(dir: string, name: string, description: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\nBody for ${name}.\n`,
  );
}

test("opencode counts own skills, compat roots, commands and instruction fallbacks", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-oc-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "sd-oc-cwd-"));
  writeSkill(path.join(home, ".config", "opencode", "skills", "alpha"), "alpha", "opencode own skill");
  writeSkill(path.join(home, ".claude", "skills", "shared"), "shared", "claude skill opencode also loads");
  fs.mkdirSync(path.join(home, ".config", "opencode", "commands"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config", "opencode", "commands", "deploy.md"), "---\ndescription: Deploy the app\n---\nDeploy it.\n");
  fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "global claude rules");
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), "project agents rules");

  const scan = await opencodeAdapter.scan({ home, cwd, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.deepEqual(
    scan.skills.map((s) => s.name).sort(),
    ["alpha", "deploy", "shared"],
  );
  assert.deepEqual(
    scan.instructions.map((i) => i.label).sort(),
    ["global CLAUDE.md (fallback)", "project AGENTS.md"],
  );
  assert.equal(scan.usageAvailable, false);
  assert.ok(scan.notes.some((n) => n.includes("compatibility roots")));
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(cwd, { recursive: true, force: true });
});

test("opencode prefers its own AGENTS.md over the claude fallback", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-oc2-"));
  fs.mkdirSync(path.join(home, ".config", "opencode"), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config", "opencode", "AGENTS.md"), "opencode rules");
  fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "claude rules");

  const scan = await opencodeAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.instructions.length, 1);
  assert.match(scan.instructions[0].label, /global AGENTS\.md/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("new adapters report not-detected on an empty home", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-empty-"));
  for (const adapter of [opencodeAdapter, windsurfAdapter, zedAdapter, copilotCliAdapter]) {
    const scan = await adapter.scan({ home, cwd: home, windowDays: 30 });
    assert.equal(scan.detected, false, adapter.id);
    assert.equal(scan.skills.length, 0, adapter.id);
  }
  fs.rmSync(home, { recursive: true, force: true });
});

test("windsurf splits always-on rules from triggered rules and counts workflows", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-ws-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "sd-ws-cwd-"));
  fs.mkdirSync(path.join(home, ".codeium", "windsurf", "memories"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codeium", "windsurf", "memories", "global_rules.md"), "always on rules");
  fs.mkdirSync(path.join(home, ".codeium", "windsurf", "global_workflows"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codeium", "windsurf", "global_workflows", "release.md"), "---\ndescription: Release flow\n---\nShip it.\n");

  const rules = path.join(cwd, ".windsurf", "rules");
  fs.mkdirSync(rules, { recursive: true });
  fs.writeFileSync(path.join(rules, "core.md"), "---\ntrigger: always_on\ndescription: Always loaded\n---\nAlways.\n");
  fs.writeFileSync(path.join(rules, "tests.md"), "---\ntrigger: glob\nglobs: \"**/*.test.ts\"\ndescription: Test conventions\n---\nTest.\n");
  fs.writeFileSync(path.join(cwd, ".windsurfrules"), "legacy always-on");

  const scan = await windsurfAdapter.scan({ home, cwd, windowDays: 30 });
  assert.equal(scan.detected, true);
  // skills: glob-triggered rule + global workflow; always_on rule & legacy file stay instructions
  assert.deepEqual(scan.skills.map((s) => s.name).sort(), ["release", "tests"]);
  assert.deepEqual(
    scan.instructions.map((i) => i.label).sort(),
    [
      "global rules (memories/global_rules.md)",
      "project .windsurfrules (legacy, always-on)",
      "project rule (always_on) core.md",
    ],
  );
  assert.equal(scan.usageAvailable, false);
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(cwd, { recursive: true, force: true });
});

test("windsurf honors the modern .devin rules layout", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-ws2-"));
  fs.mkdirSync(path.join(home, ".codeium", "windsurf"), { recursive: true });
  const devin = path.join(home, ".devin", "rules");
  fs.mkdirSync(devin, { recursive: true });
  fs.writeFileSync(path.join(devin, "style.md"), "---\ntrigger: manual\ndescription: Style guide\n---\nStyle.\n");

  const scan = await windsurfAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.deepEqual(scan.skills.map((s) => s.name), ["style"]);
  fs.rmSync(home, { recursive: true, force: true });
});

test("zed reads the cross-agent skills root and its AGENTS.md", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-zed-"));
  writeSkill(path.join(home, ".agents", "skills", "diag"), "diag", "diagnostics skill");
  fs.mkdirSync(path.join(home, ".config", "zed"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config", "zed", "AGENTS.md"), "zed rules");

  const scan = await zedAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.deepEqual(scan.skills.map((s) => s.name), ["diag"]);
  assert.deepEqual(scan.instructions.map((i) => i.label), ["global AGENTS.md"]);
  assert.ok(scan.notes.some((n) => n.includes("cross-agent standard")));
  fs.rmSync(home, { recursive: true, force: true });
});

test("copilot-cli bills instruction files only", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-gh-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "sd-gh-cwd-"));
  fs.mkdirSync(path.join(home, ".copilot"), { recursive: true });
  fs.writeFileSync(path.join(home, ".copilot", "copilot-instructions.md"), "personal rules");
  fs.mkdirSync(path.join(cwd, ".github"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".github", "copilot-instructions.md"), "repo rules");

  const scan = await copilotCliAdapter.scan({ home, cwd, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.equal(scan.skills.length, 0);
  assert.deepEqual(
    scan.instructions.map((i) => i.label).sort(),
    ["personal copilot-instructions.md", "repo .github/copilot-instructions.md"],
  );
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(cwd, { recursive: true, force: true });
});

test("planFix quarantines a shared compat directory exactly once", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sd-dedupe-"));
  const shared = path.join(tmp, "skills", "shared");
  writeSkill(shared, "shared", "carried by two agents");
  const carried = {
    agent: "claude-code" as const,
    name: "shared",
    dirName: "shared",
    description: "carried by two agents",
    body: "body",
    path: shared,
    source: "global" as const,
  };
  const mk = (id: string): AgentScan => ({
    id: id as AgentScan["id"],
    name: id,
    detected: true,
    skills: [carried],
    instructions: [],
    usage: new Map(),
    usageAvailable: true,
    conversationCount: 0,
    notes: [],
  });
  const moves = planFix([mk("claude-code"), mk("opencode")]);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, shared);
  assert.equal(moves[0].agent, "claude-code");
  fs.rmSync(tmp, { recursive: true, force: true });
});
