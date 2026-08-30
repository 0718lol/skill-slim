/**
 * skill-slim local dashboard — a single static page (wood & paper style)
 * served by server.ts. Data comes from the local API; no external assets,
 * no build step, no framework.
 */
export function renderPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>skill-slim · AI 技能包体检</title>
<style>
  :root{
    --paper:#f6f1e7; --paper2:#efe7d6; --card:#fffdf8; --line:#e6dbc6;
    --ink:#3d3229; --ink-soft:#8a7a68;
    --walnut:#6d4f39; --walnut-deep:#54402f; --oak:#a98362;
    --sage:#7f9271; --sage-bg:#eef2e6;
    --amber:#b98a24; --amber-bg:#f7eed7;
    --terra:#bd5b49; --terra-bg:#f8e7e2;
    --muted-bg:#f1ece0;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    color:var(--ink);background:
      radial-gradient(1100px 500px at 15% -5%, #fdfaf3 0%, transparent 60%),
      linear-gradient(180deg,var(--paper) 0%,var(--paper2) 100%);
    background-attachment:fixed;min-height:100vh;
  }
  header{
    background:
      repeating-linear-gradient(93deg, rgba(255,255,255,.045) 0 2px, transparent 2px 9px),
      linear-gradient(135deg,var(--walnut) 0%,var(--walnut-deep) 100%);
    color:#f6ecdd;padding:26px 32px;
    display:flex;align-items:center;gap:16px;flex-wrap:wrap;
    box-shadow:0 4px 18px rgba(84,64,47,.25);
  }
  .logo{font-family:Georgia,"Songti SC",serif;font-size:26px;letter-spacing:.5px}
  .logo b{color:#e8c894}
  .tagline{color:#e3d3bd;font-size:14px;flex:1}
  .btn{
    border:1px solid transparent;border-radius:999px;padding:9px 20px;font-size:14px;
    cursor:pointer;transition:all .15s ease;font-family:inherit;
  }
  .btn-light{background:rgba(255,255,255,.14);color:#f6ecdd;border-color:rgba(255,255,255,.25)}
  .btn-light:hover{background:rgba(255,255,255,.22)}
  .btn-primary{background:var(--walnut);color:#f9f1e4}
  .btn-primary:hover{background:var(--walnut-deep)}
  .btn-danger{background:var(--terra);color:#fff}
  .btn-ghost{background:transparent;color:var(--walnut);border-color:var(--oak)}
  .btn-ghost:hover{background:rgba(169,131,98,.12)}
  .btn:disabled{opacity:.45;cursor:default}
  main{max-width:1020px;margin:0 auto;padding:28px 24px 60px}

  .hero{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:26px}
  .hero-card{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:22px 26px;display:flex;align-items:center;gap:20px;
    box-shadow:0 10px 26px rgba(74,55,40,.08);flex:1;min-width:300px;
  }
  .ring-wrap{position:relative;width:112px;height:112px;flex:none}
  .ring-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring-num b{font-family:Georgia,serif;font-size:30px;line-height:1}
  .ring-num span{font-size:11px;color:var(--ink-soft);margin-top:3px}
  .hero-title{font-family:Georgia,"Songti SC",serif;font-size:19px;margin-bottom:6px}
  .hero-sub{color:var(--ink-soft);font-size:13px;line-height:1.7}
  .stat-tiles{display:flex;gap:14px;flex:2;min-width:300px;flex-wrap:wrap}
  .tile{
    flex:1;min-width:130px;background:var(--card);border:1px solid var(--line);
    border-radius:18px;padding:18px 20px;box-shadow:0 10px 26px rgba(74,55,40,.08);
  }
  .tile .v{font-family:Georgia,serif;font-size:24px;margin:4px 0 2px}
  .tile .k{font-size:12px;color:var(--ink-soft)}
  .tile .n{font-size:11px;color:var(--ink-soft)}

  .section-title{
    font-family:Georgia,"Songti SC",serif;font-size:18px;margin:30px 0 14px;
    display:flex;align-items:center;gap:10px;
  }
  .section-title::after{content:"";flex:1;height:1px;background:var(--line)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:16px}
  .agent{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:20px 22px;box-shadow:0 10px 26px rgba(74,55,40,.08);
  }
  .agent-head{display:flex;align-items:center;gap:14px;margin-bottom:12px}
  .agent-name{font-family:Georgia,"Songti SC",serif;font-size:18px}
  .agent-id{color:var(--ink-soft);font-size:12px}
  .agent-head .ring-wrap{width:64px;height:64px;margin-left:auto}
  .ring-num.small b{font-size:19px}
  .agent-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .chip{
    font-size:12px;padding:4px 11px;border-radius:999px;background:var(--muted-bg);
    color:#6b5c4c;border:1px solid var(--line);
  }
  .chip.money{background:var(--amber-bg);color:var(--amber);border-color:#ecdcb4}
  .finding{border-top:1px dashed var(--line);padding:10px 2px;font-size:13px;line-height:1.55}
  .finding:first-child{border-top:none}
  .f-title{font-weight:600;display:flex;gap:8px;align-items:baseline}
  .f-detail{color:var(--ink-soft);margin-top:2px}
  .f-path{color:#b0a08c;font-size:11px;word-break:break-all;margin-top:2px}
  .f-save{color:var(--sage);font-size:12px;margin-top:2px}
  .sev-warn{color:var(--amber)} .sev-error{color:var(--terra)} .sev-info{color:var(--ink-soft)}
  .notes{color:var(--ink-soft);font-size:12px;margin-top:8px;line-height:1.6}
  .clean{color:var(--sage);font-size:13px;padding:8px 0}
  .more-btn{background:none;border:none;color:var(--oak);font-size:12px;cursor:pointer;padding:8px 0 0;font-family:inherit}

  .panel{
    background:var(--card);border:1px solid var(--line);border-radius:18px;
    padding:22px 24px;box-shadow:0 10px 26px rgba(74,55,40,.08);margin-bottom:16px;
  }
  .panel h3{font-family:Georgia,"Songti SC",serif;font-size:17px;margin-bottom:10px}
  .move{display:flex;gap:10px;padding:8px 0;border-top:1px dashed var(--line);font-size:13px;align-items:baseline}
  .move:first-of-type{border-top:none}
  .move .p{color:var(--ink-soft);font-size:12px;word-break:break-all}
  .upside{
    margin:14px 0;padding:14px 18px;border-radius:14px;
    background:var(--sage-bg);border:1px solid #d6dfc9;color:#5c6e4f;font-size:14px;
  }
  .upside b{font-family:Georgia,serif;font-size:18px}
  .delta{
    margin:14px 0;padding:14px 18px;border-radius:14px;background:var(--sage-bg);
    border:1px solid #d6dfc9;font-size:15px;color:#4c5e40;
  }
  .q-item{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px dashed var(--line);font-size:13px}
  .q-item:first-of-type{border-top:none}
  .q-item .meta{color:var(--ink-soft);font-size:12px;flex:1}
  .empty{color:var(--ink-soft);font-size:13px;padding:6px 0}
  footer{max-width:1020px;margin:0 auto;padding:0 24px 40px;color:#a8977f;font-size:12px;line-height:1.8}
  .loading{padding:60px;text-align:center;color:var(--ink-soft);font-size:14px}
  .loading .dot{animation:blink 1.2s infinite}
  @keyframes blink{0%,100%{opacity:.2}50%{opacity:1}}
  .actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
</style>
</head>
<body>
<header>
  <div class="logo">🩻 <b>skill-slim</b></div>
  <div class="tagline">给你的 AI 编码 Agent 技能包做体检 · Claude Code · Codex · Gemini CLI · Cursor</div>
  <button class="btn btn-light" id="btn-plan">查看瘦身计划</button>
  <button class="btn btn-light" id="btn-rescan">重新体检</button>
</header>
<main>
  <div class="loading" id="loading">正在扫描你电脑上的 Agent 配置<span class="dot">…</span><br><span style="font-size:12px">第一次会读取会话记录，可能需要几秒钟</span></div>
  <div id="content" style="display:none"></div>

  <div id="fix-panel" style="display:none"></div>

  <div class="section-title">隔离区 · 随时可恢复</div>
  <div class="panel" id="quarantine">加载中…</div>
</main>
<footer>
  skill-slim v0.1.0 · 全程在本机运行，数据不出这台电脑 ·
  token 为启发式估算（中文≈1 token/字，英文≈3.8 字符/token），费用按 $3/百万输入 token 折算 ·
  「瘦身」只移动你自己拥有的技能目录到 ~/.skill-slim/quarantine，插件捆绑技能不受影响
</footer>
<script>
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var state = { report: null };

  function esc(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function grade(score){ return score>=92?"A":score>=78?"B":score>=60?"C":"D"; }
  function gradeColor(score){
    return score>=92?"var(--sage)":score>=78?"var(--amber)":score>=60?"#c07a35":"var(--terra)";
  }
  function usd(n){ return "$" + Number(n).toFixed(2); }
  function loc(n){ return Number(n).toLocaleString(); }

  function ring(score, size, small){
    var r = size/2 - (small?5:7), c = 2*Math.PI*r;
    var col = gradeColor(score);
    return '<div class="ring-wrap" style="width:'+size+'px;height:'+size+'px">'
      + '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'
      + '<circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" fill="none" stroke="#ece2cf" stroke-width="'+(small?6:8)+'"/>'
      + '<circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="'+(small?6:8)+'"'
      + ' stroke-linecap="round" stroke-dasharray="'+(c*score/100).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 '+size/2+' '+size/2+')"/>'
      + '</svg>'
      + '<div class="ring-num'+(small?' small':'')+'"><b style="color:'+col+'">'+score+'</b><span>'+(small?"":"综合健康分")+'</span></div>'
      + '</div>';
  }

  function findingHtml(f){
    var icon = f.severity==="error" ? "✖" : f.severity==="warn" ? "▲" : "·";
    var h = '<div class="finding">'
      + '<div class="f-title"><span class="sev-'+f.severity+'">'+icon+'</span>'+esc(f.title)+'</div>'
      + '<div class="f-detail">'+esc(f.detail)+'</div>';
    for (var i=0;i<Math.min(2,f.paths.length);i++) h += '<div class="f-path">'+esc(f.paths[i])+'</div>';
    if (f.recoverableTokens>0) h += '<div class="f-save">可回收 ~'+loc(f.recoverableTokens)+' tokens</div>';
    return h + '</div>';
  }

  function agentHtml(a){
    if (!a.detected) return '<div class="agent"><div class="agent-head"><div><span class="agent-name">'+esc(a.name)+'</span><div class="agent-id">'+a.id+' · 未安装，已跳过</div></div></div></div>';
    var findings = a.findings || [];
    var actionable = findings.filter(function(f){return f.severity!=="info";});
    var info = findings.filter(function(f){return f.severity==="info";});
    var h = '<div class="agent">'
      + '<div class="agent-head"><div><span class="agent-name">'+esc(a.name)+'</span><div class="agent-id">'+a.id+'</div></div>'
      + ring(a.score,64,true) + '</div>'
      + '<div class="agent-stats">'
      + '<span class="chip">'+a.skillCount+' 个技能</span>'
      + '<span class="chip">常驻 ~'+loc(a.alwaysOnTokens)+' tokens</span>'
      + '<span class="chip money">'+usd(a.billPer1000)+' / 千次对话</span>'
      + (a.conversations>0 ? '<span class="chip money">'+usd(a.monthlyCost)+' / 月（按当前频率）</span>' : '')
      + '</div>';
    if (findings.length===0){
      h += '<div class="clean">✓ 一切正常，没有发现问题</div>';
    } else {
      actionable.forEach(function(f){ h += findingHtml(f); });
      if (actionable.length===0 && info.length>0){
        h += '<div class="clean">✓ 没有需要你动手的问题</div>';
      }
      if (info.length>0){
        h += '<button class="more-btn" data-agent="'+a.id+'">展开 '+info.length+' 条提示（插件捆绑技能等）…</button>'
           + '<div data-info="'+a.id+'" style="display:none">'+ info.map(findingHtml).join("") +'</div>';
      }
    }
    if (a.notes && a.notes.length) h += '<div class="notes">'+ a.notes.map(esc).join("<br>") +'</div>';
    return h + '</div>';
  }

  function render(){
    var r = state.report;
    var html = '<div class="hero">'
      + '<div class="hero-card">'+ring(r.score,112,false)
      + '<div><div class="hero-title">综合健康分 · ' + grade(r.score) + ' 级</div>'
      + '<div class="hero-sub">'+r.agents.filter(function(a){return a.detected;}).length+' 个 Agent 已扫描 · 用量窗口 '+r.windowDays+' 天<br>分数越低，说明你的 Agent 每次对话背着的「行李」越重</div></div></div>'
      + '<div class="stat-tiles">'
      + '<div class="tile"><div class="k">每次对话常驻上下文</div><div class="v">~'+loc(r.totalAlwaysOnTokens)+'</div><div class="n">tokens，白送出去的注意力</div></div>'
      + '<div class="tile"><div class="k">每月浪费（按当前频率）</div><div class="v">'+usd(r.totalMonthlyCost)+'</div><div class="n">只是重复携带同样的话</div></div>'
      + '<div class="tile"><div class="k">瘦身可回收</div><div class="v">~'+loc(r.totalRecoverableTokens)+'</div><div class="n">tokens / 每次对话</div></div>'
      + '</div></div>';

    html += '<div class="section-title">各 Agent 体检详情</div><div class="grid">';
    r.agents.forEach(function(a){ html += agentHtml(a); });
    html += '</div>';
    $("content").innerHTML = html;
    $("content").style.display = "";
    $("loading").style.display = "none";

    Array.prototype.forEach.call(document.querySelectorAll(".more-btn"), function(btn){
      btn.addEventListener("click", function(){
        var box = document.querySelector('[data-info="'+btn.getAttribute("data-agent")+'"]');
        var open = box.style.display !== "none";
        box.style.display = open ? "none" : "";
        btn.textContent = open ? "展开提示…" : "收起提示";
      });
    });
  }

  function loadScan(){
    $("content").style.display="none"; $("loading").style.display="";
    return fetch("/api/scan").then(function(r){return r.json();}).then(function(data){
      state.report = data.report; render(); loadQuarantine();
    }).catch(function(e){
      $("loading").innerHTML = "扫描失败：" + esc(e.message);
    });
  }

  function loadQuarantine(){
    return fetch("/api/quarantine").then(function(r){return r.json();}).then(function(list){
      var box = $("quarantine");
      if (!list.length){ box.innerHTML = '<div class="empty">隔离区是空的。执行「瘦身」后被移走的技能会出现在这里，随时可以恢复。</div>'; return; }
      var h = "";
      list.forEach(function(e){
        h += '<div class="q-item"><b>'+esc(e.name)+'</b><span class="chip">'+esc(e.agent)+'</span>'
          + '<span class="meta">原位置 '+esc(e.originalPath)+' · '+esc(e.movedAt)+'</span>'
          + '<button class="btn btn-ghost" data-restore="'+esc(e.name)+'" data-agent="'+esc(e.agent)+'">恢复</button></div>';
      });
      box.innerHTML = h;
      Array.prototype.forEach.call(box.querySelectorAll("[data-restore]"), function(btn){
        btn.addEventListener("click", function(){
          btn.disabled = true;
          fetch("/api/restore",{method:"POST",headers:{"Content-Type":"application/json"},
            body: JSON.stringify({name: btn.getAttribute("data-restore"), agent: btn.getAttribute("data-agent")})})
          .then(function(r){return r.json();}).then(function(res){
            if (res.restored && res.restored.length) alert("已恢复："+res.restored.map(function(e){return e.name;}).join("、"));
            else alert("未能恢复：" + (res.skipped||[]).map(function(s){return s.reason;}).join("；"));
            loadQuarantine();
          });
        });
      });
    });
  }

  function showPlan(){
    $("btn-plan").disabled = true; $("btn-plan").textContent = "计算中…";
    fetch("/api/fix/plan",{method:"POST"}).then(function(r){return r.json();}).then(function(p){
      $("btn-plan").disabled = false; $("btn-plan").textContent = "查看瘦身计划";
      var box = $("fix-panel");
      if (!p.moves || !p.moves.length){
        box.style.display=""; box.innerHTML = '<div class="panel"><h3>瘦身计划</h3><div class="empty">没有可以安全隔离的技能 —— 你的技能包很干净，或者用量数据还不够（刚装 skill-slim 时会有个「认识期」）。</div></div>';
        return;
      }
      var h = '<div class="panel"><h3>瘦身计划 · '+p.moves.length+' 个技能建议隔离</h3>';
      p.moves.forEach(function(m){
        h += '<div class="move"><span class="chip">'+esc(m.agent)+'</span><div><div>'+esc(baseName(m.from))+' <span style="color:var(--terra)">→ 隔离</span></div><div class="p">'+esc(m.from)+'</div></div><div style="margin-left:auto;white-space:nowrap;color:var(--sage);font-size:12px">~'+loc(m.recoverableTokens)+' tok</div></div>';
      });
      h += '<div class="upside">瘦身收益：每次对话少背 <b>~'+loc(p.savingsTokens)+'</b> tokens'
        + (p.monthlySavings>0 ? '，按你当前的使用频率约省 <b>'+usd(p.monthlySavings)+'/月</b>' : '')
        + '。只移动你自己拥有的技能；插件捆绑技能不会被碰。随时可在隔离区一键恢复。</div>'
        + '<div class="actions"><button class="btn btn-danger" id="btn-apply">确认隔离（可在隔离区恢复）</button>'
        + '<button class="btn btn-ghost" id="btn-cancel">先不动</button></div></div>';
      box.style.display=""; box.innerHTML = h;
      $("btn-cancel").addEventListener("click", function(){ box.style.display="none"; });
      $("btn-apply").addEventListener("click", function(){
        if (!confirm("将把 "+p.moves.length+" 个技能目录移入 ~/.skill-slim/quarantine（不删除，可随时恢复）。继续？")) return;
        $("btn-apply").disabled = true; $("btn-apply").textContent = "执行中…";
        fetch("/api/fix/apply",{method:"POST"}).then(function(r){return r.json();}).then(function(res){
          var delta = "";
          if (res.report){
            delta = '<div class="delta">✅ 完成：健康分 <b>'+res.beforeScore+'</b> → <b>'+res.report.score+'</b>'
              + '，每次对话常驻上下文从 ~'+loc(res.beforeTokens)+' 降到 ~'+loc(res.report.totalAlwaysOnTokens)+' tokens。</div>';
          }
          box.innerHTML = '<div class="panel"><h3>瘦身结果</h3>'+delta
            + '<div class="empty">'+ (res.moved||[]).length +' 个已隔离，'+ (res.failed||[]).length +' 个失败。重启 Agent 会话后生效。</div></div>';
          loadScan();
        });
      });
    });
  }

  function baseName(p){ return String(p).split("/").pop(); }

  $("btn-rescan").addEventListener("click", loadScan);
  $("btn-plan").addEventListener("click", showPlan);
  loadScan();
})();
</script>
</body>
</html>`;
}
