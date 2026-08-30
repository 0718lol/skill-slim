import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { cursorAdapter } from "../src/adapters/cursor.ts";

function makeAiTrackingDb(home: string, conversations: number): void {
  const dir = path.join(home, ".cursor", "ai-tracking");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "ai-code-tracking.db"));
  db.exec(
    "CREATE TABLE conversation_summaries (conversationId TEXT PRIMARY KEY, title TEXT, overview TEXT, createdAt INTEGER)",
  );
  for (let i = 0; i < conversations; i++) {
    db.prepare("INSERT INTO conversation_summaries (conversationId, title, createdAt) VALUES (?, ?, ?)").run(
      `c${i}`,
      `conv ${i}`,
      Date.now() - i * 3600_000,
    );
  }
  db.close();
}

function writeRule(home: string, name: string, frontmatter: string): void {
  const dir = path.join(home, ".cursor", "rules");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.mdc`), `${frontmatter}\n---\nRule body for ${name}.\n`);
}

test("cursor adapter splits always-apply rules from conditional ones and reads conversations", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-cursor-"));
  writeRule(home, "always-on", "---\ndescription: Always loaded rule\nalwaysApply: true");
  writeRule(home, "conditional", "---\ndescription: Conditional rule for tests\nglobs: *.ts\nalwaysApply: false");
  makeAiTrackingDb(home, 3);

  const scan = await cursorAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.deepEqual(scan.skills.map((s) => s.name), ["conditional"]);
  assert.equal(scan.instructions.length, 1);
  assert.equal(scan.usageAvailable, false, "cursor does not log rule usage locally");
  assert.equal(scan.conversationCount, 3);

  fs.rmSync(home, { recursive: true, force: true });
});

test("cursor adapter tolerates missing ai-tracking database", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sd-cursor2-"));
  writeRule(home, "conditional", "---\ndescription: Conditional rule\nglobs: *.md");
  const scan = await cursorAdapter.scan({ home, cwd: home, windowDays: 30 });
  assert.equal(scan.detected, true);
  assert.equal(scan.conversationCount, 0);
  assert.ok(scan.notes.some((n) => n.includes("ai-tracking")));
  fs.rmSync(home, { recursive: true, force: true });
});
