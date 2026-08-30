import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFrontmatter } from "../src/util/frontmatter.ts";

test("parses flat key/value frontmatter", () => {
  const raw = "---\nname: alpha\ndescription: Review pull requests\n---\nBody here.\n";
  const { data, body } = parseFrontmatter(raw);
  assert.equal(data.name, "alpha");
  assert.equal(data.description, "Review pull requests");
  assert.equal(body, "Body here.\n");
});

test("strips surrounding quotes", () => {
  const raw = '---\ndescription: "Has: colon and \\"stuff\\""\n---\n';
  const { data } = parseFrontmatter(raw);
  assert.equal(data.description, "Has: colon and \\\"stuff\\\"");
});

test("tolerates CRLF line endings", () => {
  const raw = "---\r\nname: alpha\r\n---\r\nbody\r\n";
  const { data } = parseFrontmatter(raw);
  assert.equal(data.name, "alpha");
});

test("returns empty data when no frontmatter block", () => {
  const { data, body } = parseFrontmatter("just markdown\n");
  assert.deepEqual(data, {});
  assert.equal(body, "just markdown\n");
});

test("ignores yaml list syntax instead of crashing", () => {
  const raw = "---\nname: alpha\nallowed-tools:\n  - Bash\n  - Read\n---\nbody\n";
  const { data } = parseFrontmatter(raw);
  assert.equal(data.name, "alpha");
  assert.ok(!data["allowed-tools"]);
});
