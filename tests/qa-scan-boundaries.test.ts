import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test, type TestContext } from "node:test";
import { claudeCodeAdapter } from "../src/adapters/claude-code.ts";
import { codexAdapter } from "../src/adapters/codex.ts";

function temporaryHome(t: TestContext): string {
  const home = mkdtempSync(path.join(tmpdir(), "skill-slim-qa-scan-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

function writeSkill(root: string, folder: string, name = folder): void {
  write(path.join(root, folder, "SKILL.md"), `---\nname: ${name}\ndescription: Review release notes.\n---\nReview the notes.\n`);
}

function writeSession(home: string, payload: object): void {
  const record = { type: "response_item", payload };
  write(path.join(home, ".codex", "sessions", "rollout.jsonl"), JSON.stringify(record) + "\n");
}

function scanCodex(home: string) {
  return codexAdapter.scan({ home, cwd: home, windowDays: 30 });
}

function writeCodexPlugin(home: string, config: string): void {
  const codex = path.join(home, ".codex");
  writeSkill(path.join(codex, "plugins", "cache", "market", "pages", "1.2.3", "skills"), "page-review");
  write(path.join(codex, "config.toml"), config);
}

test("Codex counts one POSIX SKILL.md read once", async (t) => {
  const home = temporaryHome(t);
  writeSkill(path.join(home, ".codex", "skills"), "review");
  writeSession(home, { type: "custom_tool_call", name: "exec_command", input: 'cat "$HOME/.codex/skills/review/SKILL.md"' });

  const scan = await scanCodex(home);
  assert.equal(scan.conversationCount, 1);
  assert.equal(scan.usage.get("review")?.count, 1, "one file read must count as one invocation");
});

test("Codex counts a Windows skill read from function_call arguments", async (t) => {
  const home = temporaryHome(t);
  writeSkill(path.join(home, ".codex", "skills"), "win-review");
  writeSession(home, {
    type: "function_call",
    name: "shell_command",
    arguments: JSON.stringify({ command: String.raw`Get-Content 'C:\Users\QA User\.codex\skills\win-review\SKILL.md'` }),
  });

  const scan = await scanCodex(home);
  assert.equal(scan.conversationCount, 1);
  assert.equal(scan.usage.get("win-review")?.count, 1, "Windows JSON arguments must count the recorded read");
});

test("Codex credits a UTF-8 skill directory named in a transcript", async (t) => {
  const home = temporaryHome(t);
  writeSkill(path.join(home, ".codex", "skills"), "文档校对", "review");
  writeSession(home, { type: "custom_tool_call", name: "exec_command", input: 'cat "$HOME/.codex/skills/文档校对/SKILL.md"' });

  const scan = await scanCodex(home);
  assert.deepEqual(scan.skills.map((skill) => skill.dirName), ["文档校对"]);
  assert.equal(scan.usage.get("文档校对")?.count, 1, "a discovered skill must receive credit for its recorded read");
});

test("Codex excludes a cached plugin when enabled has a TOML type error", async (t) => {
  const home = temporaryHome(t);
  writeCodexPlugin(home, '[plugins."pages@market"]\nenabled = "false"\n');

  const scan = await scanCodex(home);
  assert.deepEqual(scan.skills.map((skill) => skill.name), [], "an invalid enabled field cannot establish that the plugin is active");
});

test("Codex honors disabled plugin tables with whitespace around the TOML dot", async (t) => {
  const home = temporaryHome(t);
  writeCodexPlugin(home, '[plugins . "pages@market"]\r\nenabled = false\r\n');

  const scan = await scanCodex(home);
  assert.deepEqual(scan.skills.map((skill) => skill.name), [], "a disabled plugin must stay out of the scan");
});

test("Claude excludes cached project installs with no projectPath", async (t) => {
  const home = temporaryHome(t);
  const plugins = path.join(home, ".claude", "plugins");
  const installPath = path.join(plugins, "cache", "market", "pages", "1.2.3");
  writeSkill(path.join(installPath, "skills"), "page-review");
  writeSkill(path.join(home, ".claude", "skills"), "user-review");
  write(path.join(plugins, "installed_plugins.json"), JSON.stringify({
    version: 2,
    plugins: { "pages@market": [{ scope: "project", installPath }] },
  }));
  const cwd = path.join(home, "unrelated-project");
  mkdirSync(cwd);

  const scan = await claudeCodeAdapter.scan({ home, cwd, windowDays: 30 });
  assert.deepEqual(scan.skills.map((skill) => skill.name), ["user-review"], "a project install requires a known project scope");
});
