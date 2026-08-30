/**
 * Heuristic token estimation — no tokenizer dependency, accurate enough for
 * sizing context bills. CJK characters count ~1 token each, other text ~3.8
 * chars per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.codePointAt(0)! > 0x2e80) cjk++;
    else other++;
  }
  return cjk + Math.ceil(other / 3.8);
}

/** Typical frontier-model input price, USD per 1M tokens. */
export const PRICE_PER_MTOK = 3;

export function billPer1000Requests(tokens: number): number {
  return (tokens / 1_000_000) * PRICE_PER_MTOK * 1000;
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
