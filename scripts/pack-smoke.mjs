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
import { mkdtempSync, rmSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(path.join(os.tmpdir(), "skill-slim-pack-"));
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

function run(cmd, args, opts = {}) {
  // .cmd shims need a shell on Windows; quote paths that might contain spaces
  const argv = isWin ? args.map((a) => (/[\s&()]/.test(a) ? `"${a}"` : a)) : args;
  const file = isWin && /\s/.test(cmd) ? `"${cmd}"` : cmd;
  return execFileSync(file, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: isWin, ...opts });
}

function listFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  );
}

try {
  run(npm, ["pack", "--silent", "--pack-destination", work], { cwd: root });
  const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack produced no tarball");

  const app = path.join(work, "app");
  mkdirSync(app);
  writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "smoke", version: "0.0.0", private: true }));
  run(npm, ["install", "--silent", "--no-audit", "--no-fund", path.join(work, tarball)], { cwd: app });

  // inspect what was installed rather than shelling out to tar (on Windows
  // runners Git's GNU tar can shadow bsdtar and misread C:\ as a host)
  const pkgDir = path.join(app, "node_modules", "skill-slim");
  if (!existsSync(pkgDir)) throw new Error("tarball did not install as node_modules/skill-slim");
  const files = listFiles(pkgDir);
  for (const required of ["dist/cli.js", "SKILL.md", "README.md", "LICENSE"]) {
    if (!files.includes(required)) throw new Error(`tarball is missing ${required}`);
  }
  if (files.some((f) => f.endsWith(".ts"))) throw new Error("tarball ships .ts files — Node cannot run them from node_modules");

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
