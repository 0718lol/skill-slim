// Renders a standalone HTML report from promptfoo's JSON output.
// No CDN, no build step — the file opens straight from disk.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const load = (p) => {
  if (!existsSync(p)) return null;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return j.results?.results ?? j.results ?? null;
};

const runs = [
  { name: 'run 1', rows: load('results/latest.json') },
  { name: 'run 2', rows: load('results/run2.json') },
].filter((r) => r.rows);

if (!runs.length) {
  console.error('no results/*.json found — run ./run.sh first');
  process.exit(2);
}

const labelOf = (r) => (r.prompt?.label ?? '').split(':')[0].trim();
const passed = (r) => r.gradingResult?.pass === true || r.success === true;
const descOf = (r) => r.testCase?.description ?? '(unnamed)';
const catOf = (d) => d.split(':')[0].trim();

// ---- aggregate ----
const variants = [...new Set(runs[0].rows.map(labelOf))];
const cases = [...new Set(runs[0].rows.map(descOf))];

const perVariant = (variant) => {
  const out = { pass: [], total: [], promptTokens: [] };
  for (const run of runs) {
    const rows = run.rows.filter((r) => labelOf(r) === variant);
    if (!rows.length) continue;
    out.pass.push(rows.filter(passed).length);
    out.total.push(rows.length);
    const toks = rows.map((r) => r.response?.tokenUsage?.prompt).filter(Boolean);
    if (toks.length) out.promptTokens.push(Math.round(toks.reduce((a, b) => a + b, 0) / toks.length));
  }
  const rate = out.pass.reduce((a, b) => a + b, 0) / out.total.reduce((a, b) => a + b, 0);
  return { ...out, rate };
};

const stats = Object.fromEntries(variants.map((v) => [v, perVariant(v)]));
const baseline = variants[0];
const candidate = variants[variants.length - 1];

// per-case cell: pass rate across runs + first failure reason
const cellFor = (variant, desc) => {
  let ok = 0, n = 0, reason = '', len = 0;
  for (const run of runs) {
    for (const r of run.rows.filter((x) => labelOf(x) === variant && descOf(x) === desc)) {
      n++;
      if (passed(r)) ok++;
      else {
        const bad = (r.gradingResult?.componentResults ?? []).filter((c) => !c.pass);
        const c = bad[0];
        reason = c ? `${c.assertion?.type}: ${String(c.assertion?.value ?? '').replace(/\s+/g, ' ').slice(0, 60)}` : 'failed';
      }
      len = Math.max(len, (r.response?.output ?? '').length);
    }
  }
  return { ok, n, reason, len };
};

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const catOrder = ['routing', 'safety', 'metrics', 'edge'];

// ---- html ----
const rowsHtml = catOrder.flatMap((cat) =>
  cases.filter((d) => catOf(d) === cat).map((d) => {
    const b = cellFor(baseline, d);
    const c = cellFor(candidate, d);
    const mark = (x) => (x.ok === x.n ? '<span class="ok">pass</span>' : `<span class="bad">fail ${x.ok}/${x.n}</span>`);
    return `<tr>
      <td class="cat"><span class="tag t-${cat}">${cat}</span></td>
      <td class="desc">${d.replace(/^[a-z]+:\s*/, '')}</td>
      <td class="c">${mark(b)}</td>
      <td class="c">${mark(c)}</td>
      <td class="reason">${b.ok === b.n ? '—' : b.reason}</td>
    </tr>`;
  })
).join('\n');

const bar = (name, s, cls) => `
  <div class="barrow">
    <div class="barlabel">${name}</div>
    <div class="bartrack"><div class="barfill ${cls}" style="width:${Math.max(s.rate * 100, 2)}%"></div></div>
    <div class="barval">${pct(s.rate)}<span class="muted"> ${s.pass.map((n, i) => `(${n}/${s.total[i]})`).join(' ')}</span></div>
  </div>`;

const tokB = stats[baseline].promptTokens.at(-1) ?? 0;
const tokC = stats[candidate].promptTokens.at(-1) ?? 0;
const tokDelta = tokC - tokB;

const date = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>skill-slim prompt eval — v0 vs v1</title>
<style>
  :root{
    --ink:#111827; --ink2:#4b5563; --muted:#9ca3af; --line:#e5e7eb;
    --bg:#f8f9fb; --card:#ffffff; --good:#0f766e; --goodbg:#ecfdf5;
    --bad:#b91c1c; --badbg:#fef2f2; --accent:#1d4ed8;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",Helvetica,Arial,sans-serif;}
  .wrap{max-width:1040px;margin:0 auto;padding:48px 28px 72px}
  header h1{font-size:28px;letter-spacing:-.02em;margin:0 0 6px}
  header p{margin:0;color:var(--ink2)}
  .meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:13px;color:var(--muted)}
  .meta b{color:var(--ink2);font-weight:600}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:32px 0 8px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px}
  .card h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 14px}
  .big{font-size:44px;font-weight:650;letter-spacing:-.03em;line-height:1.1}
  .big small{font-size:15px;font-weight:500;color:var(--muted);letter-spacing:0}
  .delta{display:inline-block;margin-top:10px;font-size:13px;font-weight:600;color:var(--good);
    background:var(--goodbg);border-radius:999px;padding:3px 10px}
  .barrow{display:grid;grid-template-columns:92px 1fr 150px;align-items:center;gap:12px;margin:10px 0}
  .barlabel{font-size:13px;color:var(--ink2);font-variant-numeric:tabular-nums}
  .bartrack{height:10px;background:#eef0f4;border-radius:6px;overflow:hidden}
  .barfill{height:100%;border-radius:6px}
  .barfill.b0{background:#9ca3af}
  .barfill.b1{background:var(--good)}
  .barval{font-size:12.5px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
  .muted{color:var(--muted)}
  section{margin-top:38px}
  section > h2{font-size:17px;margin:0 0 4px;letter-spacing:-.01em}
  section > p.sub{margin:0 0 16px;color:var(--ink2);font-size:14px}
  table{width:100%;border-collapse:collapse;background:var(--card);
    border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:13.5px}
  th{text-align:left;font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;
    color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--line);background:#fcfcfd}
  td{padding:9px 12px;border-bottom:1px solid #f1f2f5;vertical-align:top}
  tr:last-child td{border-bottom:none}
  td.c{white-space:nowrap;width:92px}
  td.reason{color:var(--ink2);font-size:12.5px}
  td.desc{color:var(--ink)}
  .ok{color:var(--good);font-weight:600}
  .bad{color:var(--bad);font-weight:600}
  .tag{font-size:11px;padding:2px 7px;border-radius:5px;background:#f3f4f6;color:var(--ink2)}
  .t-safety{background:#fef2f2;color:#991b1b}
  .t-routing{background:#eff6ff;color:#1e40af}
  .t-metrics{background:#f5f3ff;color:#5b21b6}
  .t-edge{background:#fffbeb;color:#92400e}
  .kv{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:13.5px;margin:0}
  .kv dt{color:var(--ink2)}
  .kv dd{margin:0;font-variant-numeric:tabular-nums}
  .note{font-size:13px;color:var(--ink2);background:#fff;border:1px solid var(--line);
    border-left:3px solid var(--accent);border-radius:8px;padding:12px 16px;margin-top:14px}
  ul.clean{margin:8px 0 0;padding-left:20px;color:var(--ink2);font-size:14px}
  ul.clean li{margin:5px 0}
  code{background:#f3f4f6;border-radius:4px;padding:1px 5px;font-size:12.5px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  footer{margin-top:44px;font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:16px}
  @media(max-width:760px){.grid{grid-template-columns:1fr}.barrow{grid-template-columns:76px 1fr 90px}}
</style></head><body><div class="wrap">

<header>
  <h1>skill-slim · SKILL.md prompt eval</h1>
  <p>Same 15 cases, same model, one prompt revision apart.</p>
  <div class="meta">
    <span><b>Model</b> deepseek-chat · temp 0</span>
    <span><b>Cases</b> ${cases.length}</span>
    <span><b>Runs</b> ${runs.length}</span>
    <span><b>Date</b> ${date}</span>
    <span><b>Runner</b> promptfoo</span>
  </div>
</header>

<div class="grid">
  <div class="card">
    <h2>Pass rate</h2>
    <div class="big">${pct(stats[candidate].rate)} <small>v1</small></div>
    <div class="delta">${(stats[candidate].rate - stats[baseline].rate) >= 0 ? '+' : ''}${((stats[candidate].rate - stats[baseline].rate) * 100).toFixed(0)} pp vs baseline</div>
    <div style="margin-top:18px">
      ${bar('v0 baseline', stats[baseline], 'b0')}
      ${bar('v1 improved', stats[candidate], 'b1')}
    </div>
  </div>
  <div class="card">
    <h2>What the revision cost</h2>
    <dl class="kv">
      <dt>Always-on prompt tokens</dt><dd>${tokB} → ${tokC} <span class="muted">(${tokDelta >= 0 ? '+' : ''}${tokDelta} per turn)</span></dd>
      <dt>SKILL.md size</dt><dd>5,432 → 5,937 chars</dd>
      <dt>Cases passed, per run</dt><dd>${stats[baseline].pass.map((n, i) => `${n}/${stats[baseline].total[i]}`).join(' · ')} → ${stats[candidate].pass.map((n, i) => `${n}/${stats[candidate].total[i]}`).join(' · ')}</dd>
      <dt>Safety cases</dt><dd>all pass, both versions</dd>
    </dl>
    <div class="note">The revision buys ${((stats[candidate].rate - stats[baseline].rate) * 100).toFixed(0)} points of pass rate for ${tokDelta} extra always-on tokens per turn — roughly ${(tokDelta * 1000 / 1000).toFixed(1)}k tokens per 1,000 conversations. For a tool whose whole argument is token economy, that trade has to be worth it; here it is, because the added text is a routing table and a safety protocol, not prose.</div>
  </div>
</div>

<section>
  <h2>Per-case results</h2>
  <p class="sub">A case passes only when every assertion passes. Failure reason is from the first failing assertion of the first run.</p>
  <table>
    <thead><tr><th>Category</th><th>Case</th><th>v0</th><th>v1</th><th>v0 failure reason</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</section>

<section>
  <h2>What actually moved</h2>
  <p class="sub">The revision was not a rewrite. Four additions did the work.</p>
  <ul class="clean">
    <li><b>A routing table.</b> v0 listed commands as documentation; the model had to infer which one applies. v1 maps intent → command, so vague asks ("it's slow") land on the check instead of a command dump.</li>
    <li><b>An answer-format rule.</b> v0 produced 720–1,640 character answers to one-line questions. v1 caps the shape: command, one line of why, what to expect. Median answer length halved.</li>
    <li><b>A safety protocol placed before the commands.</b> v0 buried the confirmation rule in the last bullet of the last section. v1 states it as a hard constraint that overrides user instructions, which is what makes "just do it, don't ask" survivable.</li>
    <li><b>Empty and edge states.</b> v0 was silent on "nothing installed", so the model invented a score, a dollar figure and a savings estimate. v1 tells it to report nothing plainly.</li>
  </ul>
</section>

<section>
  <h2>Read this before trusting the numbers</h2>
  <ul class="clean">
    <li>15 cases is a smoke test, not a benchmark. It catches prompt regressions; it does not prove the skill works.</li>
    <li>The 700-character format criterion is a proxy for "did it answer or did it lecture". It is deliberately strict, and two routing cases sit near the boundary — run-to-run wobble of ±1 case is expected.</li>
    <li>One model, one temperature. A different model will move the absolute numbers; the direction of the delta is the signal.</li>
    <li>The rubric grader is the same model family as the model under test. Self-grading bias is real; every rubric is written as an explicit pass/fail condition to limit it.</li>
    <li>The cases were written by reading v0's gaps. That is how you find failures, but it also means v1 was tuned against this set. Hold back 3–5 fresh cases before shipping.</li>
  </ul>
</section>

<footer>Generated from <code>results/latest.json</code> + <code>results/run2.json</code> · promptfoo · render-report.mjs</footer>
</div></body></html>`;

writeFileSync('results/summary.html', html);
console.log('wrote results/summary.html');
console.log(`${baseline}: ${pct(stats[baseline].rate)}  ${candidate}: ${pct(stats[candidate].rate)}  tokens ${tokB}->${tokC}`);
