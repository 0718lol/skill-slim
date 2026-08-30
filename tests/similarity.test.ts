import assert from "node:assert/strict";
import { test } from "node:test";
import { similarity } from "../src/util/similarity.ts";

test("identical text scores 1", () => {
  assert.equal(similarity("review pull requests", "review pull requests"), 1);
});

test("disjoint text scores 0", () => {
  assert.equal(similarity("deploy kubernetes clusters", "bake sourdough bread"), 0);
});

test("a short description contained in a longer one scores high", () => {
  const score = similarity("format python code", "automatically format python code before committing");
  assert.ok(score > 0.6, `expected > 0.6, got ${score}`);
});

test("somewhat related text scores mid-range", () => {
  const score = similarity("review pull requests and suggest fixes", "generate release notes from commits");
  assert.ok(score < 0.6, `expected < 0.6, got ${score}`);
});
