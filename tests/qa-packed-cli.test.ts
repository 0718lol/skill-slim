import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "cmd.exe" : "npm";
const npmPrefix = isWindows ? ["/d", "/c", "npm.cmd"] : [];
const root = path.resolve(import.meta.dirname, "..");

test("Installed CLI rejects a missing --agent value before a CI gate can pass", (t) => {
  const work = mkdtempSync(path.join(tmpdir(), "skill-slim-qa-pack-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const source = path.join(work, "source");
  const app = path.join(work, "app");
  const home = path.join(work, "home");
  for (const dir of [source, app, home]) mkdirSync(dir);

  // prepack builds dist in this copy, leaving the checkout untouched.
  for (const entry of ["src", "scripts", "package.json", "SKILL.md", "README.md", "LICENSE"]) {
    cpSync(path.join(root, entry), path.join(source, entry), { recursive: true });
  }
  writeFileSync(path.join(app, "package.json"), '{"private":true}');
  const skill = path.join(home, ".codex", "skills", "pack-review");
  mkdirSync(skill, { recursive: true });
  writeFileSync(path.join(skill, "SKILL.md"), "---\nname: pack-review\ndescription: Review release notes.\n---\nReview the notes.\n");
  const env = {
    ...process.env,
    PATH: [path.dirname(process.execPath), process.env.PATH].join(path.delimiter),
    npm_config_cache: path.join(work, "npm-cache"),
    SKILL_SLIM_HOME: home,
  };
  const options = { encoding: "utf8" as const, timeout: 30_000, env };
  execFileSync(npmCommand, [...npmPrefix, "pack", "--silent", "--offline"], { ...options, cwd: source });
  const tarballs = readdirSync(source).filter((entry) => entry.endsWith(".tgz"));
  assert.equal(tarballs.length, 1, "npm pack must produce one local tarball");
  execFileSync(npmCommand, [
    ...npmPrefix, "install", "--offline", "--no-audit", "--no-fund", `../source/${tarballs[0]}`,
  ], { ...options, cwd: app });
  rmSync(source, { recursive: true });

  const binPath = path.join("node_modules", ".bin", isWindows ? "skill-slim.cmd" : "skill-slim");
  const bin = isWindows ? "cmd.exe" : path.join(app, binPath);
  const binPrefix = isWindows ? ["/d", "/c", binPath] : [];
  const run = (args: string[]) => spawnSync(bin, [...binPrefix, ...args], { ...options, cwd: app });
  const control = run(["check", "--agent", "codex", "--json"]);
  assert.ifError(control.error);
  assert.equal(control.status, 0, control.stderr);
  const { agents } = JSON.parse(control.stdout);
  assert.deepEqual(agents.map(({ id, skillCount }) => [id, skillCount]), [["codex", 1]]);

  const result = run(["check", "--json", "--min-score", "100", "--agent"]);
  assert.ifError(result.error);
  if (result.status === 0) {
    const report = JSON.parse(result.stdout);
    t.diagnostic(`invalid command emitted a report with score ${report.score} across ${report.agents.length} adapters`);
  }
  assert.equal(result.status, 2, "an option missing its value must fail as a CLI usage error");
  assert.match(result.stderr, /--agent/i);
});
