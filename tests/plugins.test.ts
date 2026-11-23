import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { claudeCodeAdapter } from "../src/adapters/claude-code.ts";
import { codexAdapter } from "../src/adapters/codex.ts";
import { compareVersions, parseCodexPluginTables } from "../src/adapters/plugins.ts";
import { runChecks } from "../src/core/checks.ts";
import type { AgentScan } from "../src/types.ts";

process.env.SKILL_SLIM_MIN_CONVERSATIONS ??= "0";

function writeSkill(dir: string, name: string, description = `does ${name} things for the user`) {
  mkdirSync(path.join(dir, name), { recursive: true });
  writeFileSync(path.join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nbody\n`);
}

function tmpHome(): string {
  return mkdtempSync(path.join(os.tmpdir(), "skill-slim-plugins-"));
}

test("compareVersions orders numeric segments numerically", () => {
  assert.ok(compareVersions("1.0.109", "1.0.99") > 0);
  assert.ok(compareVersions("26.1117.41037", "26.1119.11507") < 0);
  assert.equal(compareVersions("1.2", "1.2"), 0);
});

test("parseCodexPluginTables reads plugin tables and their enabled flag", () => {
  const tables = parseCodexPluginTables(
    [
      'model = "x"',
      '[plugins."visualize@openai-bundled"]',
      "enabled = true",
      "[plugins.'pages@openai-curated-remote']",
      "enabled = false  # turned off",
      '[plugins."bare@m"]',
      "[mcp_servers.node_repl]",
      "enabled = false",
    ].join("\n"),
  );
  assert.deepEqual([...tables], [
    ["visualize@openai-bundled", true],
    ["pages@openai-curated-remote", false],
    ["bare@m", true],
  ]);
});

test("codex: only enabled plugins count, newest cached version, other marketplaces' copies skipped", async () => {
  const home = tmpHome();
  try {
    const codex = path.join(home, ".codex");
    const cache = path.join(codex, "plugins", "cache");
    // enabled, two cached versions → only the newest is loaded
    writeSkill(path.join(cache, "openai-bundled", "visualize", "1.0.99", "skills"), "visualize-old");
    writeSkill(path.join(cache, "openai-bundled", "visualize", "1.0.109", "skills"), "visualize");
    // same plugin cached from another marketplace, not enabled
    writeSkill(path.join(cache, "openai-curated-remote", "visualize", "1.0.109", "skills"), "visualize");
    // disabled plugin and a never-enabled one
    writeSkill(path.join(cache, "openai-curated-remote", "pages", "0.1.26", "skills"), "pages");
    writeSkill(path.join(cache, "openai-curated-remote", "sites", "1.1.7", "skills"), "sites");
    writeFileSync(
      path.join(codex, "config.toml"),
      '[plugins."visualize@openai-bundled"]\nenabled = true\n\n[plugins."pages@openai-curated-remote"]\nenabled = false\n',
    );

    const scan = await codexAdapter.scan({ home, cwd: home, windowDays: 30 });
    assert.deepEqual(scan.skills.map((s) => s.name), ["visualize"]);
    assert.ok(scan.notes.includes("skipped 3 cached plugin(s) not enabled in config.toml"), scan.notes.join("; "));
    assert.equal(runChecks(scan).findings.filter((f) => f.kind === "duplicate").length, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("codex without plugin tables in config.toml falls back to walking the cache", async () => {
  const home = tmpHome();
  try {
    const codex = path.join(home, ".codex");
    writeSkill(path.join(codex, "plugins", "cache", "m", "p", "skills"), "plugskill");
    writeFileSync(path.join(codex, "config.toml"), 'model = "gpt"\n');
    const scan = await codexAdapter.scan({ home, cwd: home, windowDays: 30 });
    assert.deepEqual(scan.skills.map((s) => s.name), ["plugskill"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("claude: installed_plugins.json + enabledPlugins decide; marketplace catalogs are ignored", async () => {
  const home = tmpHome();
  try {
    const claude = path.join(home, ".claude");
    const plugins = path.join(claude, "plugins");
    const onPath = path.join(plugins, "cache", "mkt", "on-plugin", "1.0.0");
    const offPath = path.join(plugins, "cache", "mkt", "off-plugin", "1.0.0");
    writeSkill(path.join(onPath, "skills"), "on-skill");
    writeSkill(path.join(offPath, "skills"), "off-skill");
    // the whole marketplace catalog is cloned, incl. plugins never installed
    writeSkill(path.join(plugins, "marketplaces", "mkt", "plugins", "catalog-only", "skills"), "catalog-skill");
    writeFileSync(
      path.join(plugins, "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "on-plugin@mkt": [{ scope: "user", installPath: onPath }],
          "off-plugin@mkt": [{ scope: "user", installPath: offPath }],
          "elsewhere@mkt": [{ scope: "project", projectPath: "/some/other/project", installPath: onPath }],
        },
      }),
    );
    writeFileSync(path.join(claude, "settings.json"), JSON.stringify({ enabledPlugins: { "off-plugin@mkt": false } }));

    const scan = await claudeCodeAdapter.scan({ home, cwd: home, windowDays: 30 });
    assert.deepEqual(scan.skills.map((s) => s.name), ["on-skill"]);
    assert.ok(scan.notes.includes("skipped 1 installed plugin(s) disabled in settings"), scan.notes.join("; "));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the same skill loaded from two enabled plugin installs is an actionable duplicate", () => {
  const skill = (p: string) => ({
    agent: "codex" as const,
    name: "visualize",
    dirName: "visualize",
    description: "Render charts and diagrams from data",
    body: "body",
    path: p,
    source: "plugin" as const,
  });
  const scan: AgentScan = {
    id: "codex",
    name: "Codex CLI",
    detected: true,
    skills: [skill("/a/visualize"), skill("/b/visualize")],
    instructions: [],
    usage: new Map(),
    usageAvailable: false,
    conversationCount: 0,
    notes: [],
  };
  const dup = runChecks(scan).findings.find((f) => f.kind === "duplicate");
  assert.equal(dup?.severity, "warn");
  assert.match(dup!.detail, /loaded twice/);
});
