import assert from "node:assert/strict";
import { test } from "node:test";
import { billPer1000Requests, estimateTokens } from "../src/util/tokens.ts";

test("latin text is roughly 3.8 chars per token", () => {
  assert.equal(estimateTokens("hello world"), Math.ceil(11 / 3.8));
});

test("cjk text counts about one token per character", () => {
  assert.equal(estimateTokens("你好世界"), 4);
});

test("empty input is zero", () => {
  assert.equal(estimateTokens(""), 0);
});

test("bill scales linearly with tokens", () => {
  assert.equal(billPer1000Requests(1_000_000), 3000);
  assert.equal(billPer1000Requests(0), 0);
});
