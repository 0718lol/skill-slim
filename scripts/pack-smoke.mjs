#!/usr/bin/env node
/**
 * Pack-and-install smoke test: proves the tarball users get from npm actually
 * runs. `npm pack` (which triggers the prepack build), install the tarball
 * into a throwaway project, then run the installed bin. Catches what the
 * in-repo test suite cannot: missing files in "files", a bin pointing at
 * TypeScript (Node won't strip types under node_modules), symlinked-bin entry
 * detection, and so on.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(path.join(os.tmpdir(), "skill-slim-pack-"));
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: isWin, ...opts });
}

try {
  run(npm, ["pack", "--silent", "--pack-destination", work], { cwd: root });
  const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack produced no tarball");

  const files = run("tar", ["-tzf", path.join(work, tarball)]).split(/\r?\n/).filter(Boolean);
  for (const required of ["package/dist/cli.js", "package/SKILL.md", "package/README.md", "package/LICENSE"]) {
    if (!files.includes(required)) throw new Error(`tarball is missing ${required}`);
  }
  if (files.some((f) => f.endsWith(".ts"))) throw new Error("tarball ships .ts files — Node cannot run them from node_modules");

  const app = path.join(work, "app");
  mkdirSync(app);
  writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "smoke", version: "0.0.0", private: true }));
  run(npm, ["install", "--silent", "--no-audit", "--no-fund", path.join(work, tarball)], { cwd: app });

  const bin = path.join(app, "node_modules", ".bin", isWin ? "skill-slim.cmd" : "skill-slim");
  const home = path.join(work, "home");
  mkdirSync(home);
  const env = { ...process.env, SKILL_SLIM_HOME: home };

  const version = run(bin, ["--version"], { env }).trim();
  if (!/^skill-slim v\d+\.\d+\.\d+/.test(version)) throw new Error(`unexpected --version output: ${version}`);

  const json = JSON.parse(run(bin, ["--json"], { env, cwd: home }));
  if (!Array.isArray(json.agents) || json.agents.length === 0) throw new Error("--json returned no agents");

  console.log(`pack smoke test passed: ${tarball} → ${version}, ${json.agents.length} adapters`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
