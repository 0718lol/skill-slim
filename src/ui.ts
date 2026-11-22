import { CLIENT_SCRIPT } from "./ui-client.ts";
import { VERSION } from "./version.ts";

/**
 * skill-slim local dashboard — a single static page (wood & paper style)
 * served by server.ts. Data comes from the local API; no external assets,
 * no build step, no framework.
 *
 * Bilingual (English / 简体中文): every visible string is filled in by the
 * client script (src/ui-client.ts), which picks the language from the saved
 * choice or the browser's preferred languages and offers a header toggle.
 * The HTML shell below therefore carries no user-facing copy of its own.
 */
export function renderPage(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>skill-slim</title>
<style>
  :root{
    --paper:#f6f1e7; --paper2:#efe7d6; --card:#fffdf8; --line:#e6dbc6;
    --ink:#3d3229; --ink-soft:#8a7a68; --ink-faint:#ab9b86;
    --walnut:#6d4f39; --walnut-deep:#54402f; --oak:#a98362;
    --sage:#6f845f; --sage-bg:#eef2e6;
    --amber:#a87b18; --amber-bg:#f7eed7;
    --terra:#bd5b49; --terra-bg:#f8e7e2;
    --muted-bg:#f1ece0;
    --shadow:0 1px 2px rgba(74,55,40,.05),0 8px 22px rgba(74,55,40,.07);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  [hidden]{display:none !important}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    color:var(--ink);background:
      radial-gradient(1100px 500px at 15% -5%, #fdfaf3 0%, transparent 60%),
      linear-gradient(180deg,var(--paper) 0%,var(--paper2) 100%);
    background-attachment:fixed;min-height:100vh;-webkit-font-smoothing:antialiased;
  }
  header{
    background:
      repeating-linear-gradient(93deg, rgba(255,255,255,.045) 0 2px, transparent 2px 9px),
      linear-gradient(135deg,var(--walnut) 0%,var(--walnut-deep) 100%);
    color:#f6ecdd;padding:22px max(24px, calc((100vw - 1020px) / 2 + 24px));
    display:flex;align-items:center;gap:14px 18px;flex-wrap:wrap;
    box-shadow:0 4px 18px rgba(84,64,47,.25);
  }
  .logo{font-family:Georgia,"Songti SC",serif;font-size:26px;letter-spacing:.5px;white-space:nowrap}
  .logo b{color:#e8c894}
  .tagline{color:#e3d3bd;font-size:13px;flex:1;min-width:220px;line-height:1.6}
  .head-actions{display:flex;gap:10px;align-items:center}
  .btn{
    border:1px solid transparent;border-radius:999px;padding:8px 18px;font-size:14px;
    cursor:pointer;transition:background .15s ease,border-color .15s ease;font-family:inherit;white-space:nowrap;
  }
  .btn:focus-visible,.chip-btn:focus-visible,.search:focus-visible,.more-btn:focus-visible{outline:2px solid var(--oak);outline-offset:2px}
  .btn-light{background:rgba(255,255,255,.14);color:#f6ecdd;border-color:rgba(255,255,255,.25)}
  .btn-light:hover{background:rgba(255,255,255,.22)}
  .btn-lang{background:transparent;color:#e8c894;border-color:rgba(232,200,148,.45);padding:6px 12px;font-size:13px;min-width:48px}
  .btn-lang:hover{background:rgba(232,200,148,.12)}
  .btn-danger{background:var(--terra);color:#fff}
  .btn-danger:hover{background:#a84d3c}
  .btn-ghost{background:transparent;color:var(--walnut);border-color:var(--oak)}
  .btn-ghost:hover{background:rgba(169,131,98,.12)}
  .btn-sm{padding:5px 14px;font-size:13px}
  .btn:disabled{opacity:.45;cursor:default}
  main{max-width:1020px;margin:0 auto;padding:28px 24px 60px}

  .hero{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
  .hero-card{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:22px 24px;display:flex;align-items:center;gap:20px;
    box-shadow:var(--shadow);flex:1 1 320px;
  }
  .ring-wrap{position:relative;flex:none}
  .ring-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring-num b{font-family:Georgia,serif;font-size:30px;line-height:1}
  .ring-num span{font-size:11px;color:var(--ink-soft);margin-top:3px}
  .ring-num.small b{font-size:19px}
  .hero-title{font-family:Georgia,"Songti SC",serif;font-size:19px;margin-bottom:6px}
  .hero-sub{color:var(--ink-soft);font-size:13px;line-height:1.7}
  .stat-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;flex:2 1 480px}
  .tile{
    background:var(--card);border:1px solid var(--line);
    border-radius:18px;padding:18px 18px;box-shadow:var(--shadow);
  }
  .tile .v{font-family:Georgia,serif;font-size:26px;margin:6px 0 4px;font-variant-numeric:tabular-nums}
  .tile .k{font-size:12px;color:var(--ink-soft)}
  .tile .n{font-size:11px;color:var(--ink-faint);line-height:1.5}
  .tile.good .v{color:var(--sage)}

  .section-title{
    font-family:Georgia,"Songti SC",serif;font-size:18px;margin:30px 0 14px;
    display:flex;align-items:center;gap:10px;
  }
  .section-title::after{content:"";flex:1;height:1px;background:var(--line)}

  .toolbar{
    display:flex;gap:10px 14px;flex-wrap:wrap;align-items:center;margin-bottom:14px;
    position:sticky;top:8px;z-index:5;padding:12px 14px;
    background:rgba(255,253,248,.94);border:1px solid var(--line);border-radius:16px;
    box-shadow:var(--shadow);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  }
  .search{
    flex:1 1 240px;min-width:0;border:1px solid var(--line);border-radius:999px;
    padding:8px 16px 8px 36px;font-size:13px;color:var(--ink);font-family:inherit;
    background:var(--paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23ab9b86' stroke-width='1.8' stroke-linecap='round'%3E%3Ccircle cx='7' cy='7' r='5'/%3E%3Cpath d='M11 11l3.5 3.5'/%3E%3C/svg%3E") no-repeat 13px 50%;
  }
  .search:focus{background-color:#fff}
  .search::placeholder{color:var(--ink-faint)}
  .chips{display:flex;gap:6px;flex-wrap:wrap}
  .chip-btn{
    font-size:12px;padding:5px 12px;border-radius:999px;background:var(--card);
    color:#6b5c4c;border:1px solid var(--line);cursor:pointer;font-family:inherit;
  }
  .chip-btn:hover{border-color:var(--oak)}
  .chip-btn[aria-pressed="true"]{background:var(--walnut);border-color:var(--walnut);color:#f9f1e4}
  .chip-btn .c{opacity:.7;margin-left:4px;font-variant-numeric:tabular-nums}
  .result-count{font-size:12px;color:var(--ink-soft);width:100%}
  .result-count:empty{display:none}
  .result-count button{background:none;border:none;color:var(--oak);cursor:pointer;font:inherit;margin-left:6px;text-decoration:underline}

  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:16px;align-items:start}
  .agent{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:20px 22px;box-shadow:var(--shadow);min-width:0;
  }
  .agent-head{display:flex;align-items:center;gap:14px;margin-bottom:12px}
  .agent-head .ring-wrap{margin-left:auto}
  .agent-name{font-family:Georgia,"Songti SC",serif;font-size:18px}
  .agent-id{color:var(--ink-soft);font-size:12px}
  .agent-stats{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
  .chip{
    font-size:12px;padding:3px 10px;border-radius:999px;background:var(--muted-bg);
    color:#6b5c4c;border:1px solid var(--line);white-space:nowrap;
  }
  .chip.money{background:var(--amber-bg);color:var(--amber);border-color:#ecdcb4}
  .finding{border-top:1px dashed var(--line);padding:10px 2px;font-size:13px;line-height:1.55}
  .finding:first-child{border-top:none}
  .f-title{font-weight:600;display:flex;gap:8px;align-items:baseline}
  .f-title .t{min-width:0;overflow-wrap:anywhere}
  .f-detail{color:var(--ink-soft);margin-top:2px}
  .f-path{color:var(--ink-faint);font-size:11px;overflow-wrap:anywhere;margin-top:2px;font-family:ui-monospace,Menlo,monospace}
  .f-save{color:var(--sage);font-size:12px;margin-top:2px}
  .sev{flex:none;width:14px;text-align:center}
  .sev-warn{color:var(--amber)} .sev-error{color:var(--terra)} .sev-info{color:var(--ink-faint)}
  mark{background:#f3dfa8;color:inherit;border-radius:3px;padding:0 1px}
  .notes{color:var(--ink-soft);font-size:12px;margin-top:10px;line-height:1.7;border-top:1px solid var(--line);padding-top:8px}
  .clean{color:var(--sage);font-size:13px;padding:8px 0}
  .more-btn{background:none;border:none;color:var(--oak);font-size:12px;cursor:pointer;padding:8px 0 0;font-family:inherit;display:block;text-align:left}
  .more-btn:hover{color:var(--walnut)}
  .absent{margin-top:14px;font-size:12px;color:var(--ink-soft);display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .absent .chip{background:transparent;color:var(--ink-faint)}
  .no-match{grid-column:1/-1;text-align:center;color:var(--ink-soft);font-size:13px;padding:30px 0}

  .panel{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:22px 24px;box-shadow:var(--shadow);margin-bottom:16px;
  }
  #fix-panel .panel{border-color:var(--oak);scroll-margin-top:16px}
  .panel h3{font-family:Georgia,"Songti SC",serif;font-size:17px;margin-bottom:10px;display:flex;align-items:center}
  .panel h3 .x{margin-left:auto;background:none;border:none;font-size:20px;color:var(--ink-faint);cursor:pointer;line-height:1}
  .move{display:flex;gap:10px;padding:8px 0;border-top:1px dashed var(--line);font-size:13px;align-items:baseline}
  .move:first-of-type{border-top:none}
  .move .p{color:var(--ink-faint);font-size:11px;overflow-wrap:anywhere;font-family:ui-monospace,Menlo,monospace}
  .upside,.delta{
    margin:14px 0;padding:14px 18px;border-radius:14px;
    background:var(--sage-bg);border:1px solid #d6dfc9;color:#5c6e4f;font-size:14px;line-height:1.7;
  }
  .upside b,.delta b{font-family:Georgia,serif;font-size:18px}
  .q-item{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px dashed var(--line);font-size:13px;flex-wrap:wrap}
  .q-item:first-of-type{border-top:none}
  .q-item .meta{color:var(--ink-soft);font-size:12px;flex:1;min-width:200px;overflow-wrap:anywhere}
  .empty{color:var(--ink-soft);font-size:13px;padding:6px 0;line-height:1.7}
  footer{max-width:1020px;margin:0 auto;padding:0 24px 40px;color:#a8977f;font-size:12px;line-height:1.8}
  .loading{padding:60px 20px;text-align:center;color:var(--ink-soft);font-size:14px;line-height:1.8}
  .loading-sub{font-size:12px}
  .loading.error{color:var(--terra)}
  .loading .dot{animation:blink 1.2s infinite}
  @keyframes blink{0%,100%{opacity:.2}50%{opacity:1}}
  .actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
  #toast{
    position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);opacity:0;pointer-events:none;
    background:var(--walnut-deep);color:#f9f1e4;padding:10px 20px;border-radius:999px;font-size:13px;
    box-shadow:0 8px 24px rgba(54,40,30,.3);transition:opacity .2s ease,transform .2s ease;max-width:90vw;
  }
  #toast.show{opacity:1;transform:translate(-50%,0)}
  #toast.bad{background:var(--terra)}
  @media (max-width:720px){
    header{padding:18px 18px}
    main{padding:20px 14px 48px}
    .stat-tiles{grid-template-columns:1fr 1fr}
    .stat-tiles .tile:last-child{grid-column:1/-1}
    .hero-card{padding:18px}
    .agent{padding:16px}
    .toolbar{position:static}
  }
  @media (prefers-reduced-motion:reduce){*{transition:none !important;animation:none !important}}
</style>
</head>
<body>
<header>
  <div class="logo">🩻 <b>skill-slim</b></div>
  <div class="tagline" id="tagline"></div>
  <div class="head-actions">
    <button class="btn btn-light" id="btn-plan"></button>
    <button class="btn btn-light" id="btn-rescan"></button>
    <button class="btn btn-lang" id="btn-lang"></button>
  </div>
</header>
<main>
  <div id="fix-panel" hidden></div>
  <div class="loading" id="loading"></div>
  <div id="content" hidden></div>

  <div class="section-title" id="q-title"></div>
  <div class="panel" id="quarantine"><div class="empty">…</div></div>
</main>
<footer>skill-slim v${VERSION} · <span id="footer-text"></span></footer>
<div id="toast" role="status" aria-live="polite"></div>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
