/**
 * Client-side script for the dashboard. Kept in String.raw so regexes keep
 * their backslashes; the script itself never uses template literals or "${".
 *
 * i18n: English and Simplified Chinese. The language comes from (1) the
 * user's explicit choice saved in localStorage, else (2) navigator.languages
 * (any zh-* → Chinese), else English. Backend findings/notes are English
 * (shared with the CLI and JSON output); the Chinese view translates them by
 * template and falls back to the original text for anything unknown.
 */
export const CLIENT_SCRIPT = String.raw`
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var state = { report: null, query: "", sev: "all", kind: "all", expanded: {} };
  var PREVIEW = 5;
  var LANG_KEY = "skill-slim-lang";

  // ---------------------------------------------------------------- i18n --
  var I18N = {
    en: {
      tagline: "Health check for your AI coding agent's skills · Claude Code, Codex, Gemini CLI, Cursor and 4 more",
      plan: "Slim-down plan", computing: "Calculating…", rescan: "Re-scan", langSwitch: "中文", langSwitchAria: "切换到中文",
      loading: "Scanning agent configs on this machine", loadingSub: "The first run reads session transcripts and may take a few seconds",
      loadingShort: "Loading…", scanFailed: "Scan failed: {0}", retryHint: "Hit “Re-scan” in the top-right corner to try again",
      quarantineTitle: "Quarantine · restore any time",
      footer: "Runs entirely on this machine — no data leaves it · token counts are a heuristic (CJK ≈ 1 token/char, other text ≈ 3.8 chars/token), priced at $3 per 1M input tokens · slim-down only moves skill folders you own into ~/.skill-slim/quarantine; plugin-bundled skills are never touched",
      ringLabel: "health", healthAria: "Health score {0}",
      heroTitle: "Overall health: {0}",
      heroSub: "{0} agents scanned · {1}-day usage window<br>Weighted by what each agent carries. Lower score, more baggage in every conversation.",
      heroSubOne: "{0} agent scanned · {1}-day usage window<br>Weighted by what each agent carries. Lower score, more baggage in every conversation.",
      tAlwaysOnK: "Always-on context per conversation", tAlwaysOnN: "tokens read before every conversation starts",
      tMonthlyK: "Always-on cost per month", tMonthlySmall: "At your current pace — small money; the real cost is attention",
      tMonthlyBig: "At your current pace, all spent re-sending the same text",
      tRecoverK: "Recoverable by slimming", tRecoverN: "tokens per conversation, counting only what you can act on", tRecoverNone: "No redundancy you need to deal with",
      sectionAgents: "Agent details",
      searchPh: "Search skills, findings or paths…  ( / )", searchAria: "Search findings",
      sevAria: "Filter by severity", kindAria: "Filter by type",
      fAll: "All", fAction: "Actionable", fError: "Errors", fWarn: "Warnings", fInfo: "Tips", fAllKinds: "All types",
      kUnused: "Unused", kDuplicate: "Duplicate", kConvention: "Convention", kBill: "Always-on cost",
      showing: "Showing {0} of {1}", clear: "Clear filters",
      noMatch: "Nothing matches — try another keyword or clear the filters.",
      noAgents: "No supported agent was found on this machine.",
      absent: "Not installed (skipped):",
      cSkills: "{0} skills", cSkillsOne: "{0} skill", cInstr: "{0} instruction files", cInstrOne: "{0} instruction file", cAlwaysOn: "~{0} tokens always-on", cPer1k: "{0} / 1k conversations", cMonth: "{0} / month",
      noHits: "No matching findings", cleanAll: "✓ All clear — no issues found", cleanAction: "✓ Nothing needs your attention",
      moreAct: "Show {0} more actionable findings", moreActOne: "Show 1 more actionable finding", less: "Show less",
      infoShow: "Show {0} tips (plugin-bundled skills etc. — no action needed)", infoShowOne: "Show 1 tip (plugin-bundled skills etc. — no action needed)",
      infoHide: "Hide {0} tips", infoHideOne: "Hide 1 tip",
      recoverable: "Recoverable ~{0} tokens",
      qEmpty: "The quarantine is empty. Skills moved out by a slim-down show up here and can be restored any time.",
      qFailed: "Could not read the quarantine: {0}", qFrom: "from {0} · {1}", restore: "Restore", restoring: "Restoring…",
      restored: "Restored: {0} — restart your agent sessions to pick it up", restoreSkipped: "Could not restore: {0}", unknownReason: "unknown reason",
      restoreFail: "Restore failed: {0}",
      planTitle: "Slim-down plan", planCount: " · {0} skills to quarantine", planCountOne: " · {0} skill to quarantine", close: "Close",
      planEmpty: "Nothing can be safely quarantined — either your setup is lean, or there aren't enough conversations yet to tell which skills you really never use.",
      toQuarantine: "→ quarantine",
      upside: "Upside: <b>~{0}</b> fewer tokens in every conversation", upsideMonthly: ", about <b>{0}/month</b> at your current pace",
      upsideTail: ". Only skills you own are moved; plugin-bundled skills are left alone. Restore any time from the quarantine.",
      apply: "Quarantine them (restorable)", cancel: "Not now", planFail: "Could not compute the plan: {0}",
      confirm: "Move {0} skill folder(s) into ~/.skill-slim/quarantine? Nothing is deleted and you can restore any time.",
      applying: "Working…", resultTitle: "Slim-down result",
      delta: "✅ Done: health score <b>{0}</b> → <b>{1}</b>; always-on context per conversation down from ~{2} to ~{3} tokens.",
      resultSummary: "{0} quarantined, {1} failed. Takes effect after you restart your agent sessions.",
      applyFail: "Quarantine failed: {0}"
    },
    zh: {
      tagline: "给你的 AI 编码 Agent 技能包做体检 · 支持 Claude Code、Codex、Gemini CLI、Cursor 等 8 个 Agent",
      plan: "查看瘦身计划", computing: "计算中…", rescan: "重新体检", langSwitch: "EN", langSwitchAria: "Switch to English",
      loading: "正在扫描你电脑上的 Agent 配置", loadingSub: "第一次会读取会话记录，可能需要几秒钟",
      loadingShort: "加载中…", scanFailed: "扫描失败：{0}", retryHint: "可以点右上角「重新体检」再试一次",
      quarantineTitle: "隔离区 · 随时可恢复",
      footer: "全程在本机运行，数据不出这台电脑 · token 为启发式估算（中文≈1 token/字，英文≈3.8 字符/token），费用按 $3/百万输入 token 折算 · 「瘦身」只移动你自己拥有的技能目录到 ~/.skill-slim/quarantine，插件捆绑技能不受影响",
      ringLabel: "综合健康分", healthAria: "健康分 {0}",
      heroTitle: "综合健康分 · {0} 级",
      heroSub: "{0} 个 Agent 已扫描 · 用量窗口 {1} 天<br>按各 Agent 携带的技能量加权；分数越低，每次对话背的「行李」越重",
      heroSubOne: "{0} 个 Agent 已扫描 · 用量窗口 {1} 天<br>按各 Agent 携带的技能量加权；分数越低，每次对话背的「行李」越重",
      tAlwaysOnK: "每次对话常驻上下文", tAlwaysOnN: "tokens，每次对话都要先读一遍",
      tMonthlyK: "每月常驻成本", tMonthlySmall: "按当前频率估算；金额不大，主要代价是占用注意力",
      tMonthlyBig: "按当前频率估算，都花在重复携带同样的话上",
      tRecoverK: "瘦身可回收", tRecoverN: "tokens / 每次对话，只算你能处理的部分", tRecoverNone: "没有需要你处理的冗余",
      sectionAgents: "各 Agent 体检详情",
      searchPh: "搜索技能名、问题或路径…（/）", searchAria: "搜索问题",
      sevAria: "按严重程度筛选", kindAria: "按类型筛选",
      fAll: "全部", fAction: "需处理", fError: "错误", fWarn: "警告", fInfo: "提示", fAllKinds: "所有类型",
      kUnused: "未使用", kDuplicate: "重复", kConvention: "规范", kBill: "常驻成本",
      showing: "显示 {0} / {1} 条", clear: "清除筛选",
      noMatch: "没有符合条件的问题，换个关键词或清除筛选试试。",
      noAgents: "这台电脑上没有检测到支持的 Agent。",
      absent: "未安装（已跳过）：",
      cSkills: "{0} 个技能", cSkillsOne: "{0} 个技能", cInstr: "{0} 个指令文件", cInstrOne: "{0} 个指令文件", cAlwaysOn: "常驻 ~{0} tokens", cPer1k: "{0} / 千次对话", cMonth: "{0} / 月",
      noHits: "没有符合条件的问题", cleanAll: "✓ 一切正常，没有发现问题", cleanAction: "✓ 没有需要你动手的问题",
      moreAct: "再显示 {0} 条需处理的问题", moreActOne: "再显示 1 条需处理的问题", less: "收起",
      infoShow: "展开 {0} 条提示（插件捆绑技能等，无需处理）", infoShowOne: "展开 1 条提示（插件捆绑技能等，无需处理）",
      infoHide: "收起 {0} 条提示", infoHideOne: "收起 1 条提示",
      recoverable: "可回收 ~{0} tokens",
      qEmpty: "隔离区是空的。执行「瘦身」后被移走的技能会出现在这里，随时可以恢复。",
      qFailed: "读取隔离区失败：{0}", qFrom: "原位置 {0} · {1}", restore: "恢复", restoring: "恢复中…",
      restored: "已恢复：{0}，重启 Agent 会话后生效", restoreSkipped: "未能恢复：{0}", unknownReason: "原因未知",
      restoreFail: "恢复失败：{0}",
      planTitle: "瘦身计划", planCount: " · {0} 个技能建议隔离", planCountOne: " · {0} 个技能建议隔离", close: "关闭",
      planEmpty: "没有可以安全隔离的技能 —— 你的技能包很干净，或者会话记录还不够多，暂时没法判断哪些技能真的没用（需要一段「认识期」）。",
      toQuarantine: "→ 隔离",
      upside: "瘦身收益：每次对话少背 <b>~{0}</b> tokens", upsideMonthly: "，按你当前的使用频率约省 <b>{0}/月</b>",
      upsideTail: "。只移动你自己拥有的技能；插件捆绑技能不会被碰。随时可在隔离区一键恢复。",
      apply: "确认隔离（可在隔离区恢复）", cancel: "先不动", planFail: "计算瘦身计划失败：{0}",
      confirm: "将把 {0} 个技能目录移入 ~/.skill-slim/quarantine（不删除，可随时恢复）。继续？",
      applying: "执行中…", resultTitle: "瘦身结果",
      delta: "✅ 完成：健康分 <b>{0}</b> → <b>{1}</b>，每次对话常驻上下文从 ~{2} 降到 ~{3} tokens。",
      resultSummary: "{0} 个已隔离，{1} 个失败。重启 Agent 会话后生效。",
      applyFail: "隔离失败：{0}"
    }
  };

  function detectLang(){
    try { var saved = localStorage.getItem(LANG_KEY); if (saved === "en" || saved === "zh") return saved; } catch (e) {}
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    return String(langs[0] || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  }
  var lang = detectLang();

  /** t(key, a, b, …): dictionary lookup with {0}{1}… placeholders (args are inserted as given) */
  function t(key){
    var s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    var args = arguments;
    return s.replace(/\{(\d)\}/g, function(_, i){ var v = args[+i + 1]; return v === undefined ? "" : String(v); });
  }

  /** plural-aware t(): uses key + "One" when the first argument is exactly 1 */
  function tn(key, n){
    var args = Array.prototype.slice.call(arguments);
    if (n === 1 && I18N.en[key + "One"]) args[0] = key + "One";
    return t.apply(null, args);
  }

  function esc(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function grade(score){ return score>=92?"A":score>=78?"B":score>=60?"C":"D"; }
  function gradeColor(score){
    return score>=92?"var(--sage)":score>=78?"var(--amber)":score>=60?"#c07a35":"var(--terra)";
  }
  function usd(n){ return "$" + Number(n).toFixed(2); }
  function locale(){ return lang === "zh" ? "zh-CN" : "en-US"; }
  function loc(n){ return Number(n).toLocaleString(locale()); }

  /** fetch JSON; non-2xx responses become errors instead of half-rendered pages */
  function api(url, opts){
    return fetch(url, opts).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(body){
        if (!r.ok) throw new Error((body && body.error) || ("HTTP " + r.status));
        return body;
      });
    });
  }

  var toastTimer;
  function toast(msg, bad){
    var el = $("toast");
    el.textContent = msg; el.className = "show" + (bad ? " bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.className = ""; }, 3200);
  }

  // ---- Chinese view of backend (English) findings and notes; unknown text passes through ----
  var SOURCE_ZH = { global: "全局", project: "项目", plugin: "插件", extension: "扩展" };
  var TITLE_ZH = [
    [/^Always-on context: ~([\d,]+) tokens$/, function(m){ return "常驻上下文：约 " + m[1] + " tokens"; }],
    [/^"(.+)" overlaps "(.+)" \((\d+)% similar\)$/, function(m){ return "「" + m[1] + "」与「" + m[2] + "」功能重叠（相似度 " + m[3] + "%）"; }],
    [/^"(.+)" \((\w+)\) never invoked in the scan window$/, function(m){ return "「" + m[1] + "」（" + (SOURCE_ZH[m[2]] || m[2]) + "）在扫描窗口内从未被调用"; }],
    [/^"(.+)" has no description$/, function(m){ return "「" + m[1] + "」缺少描述"; }],
    [/^"(.+)" description is (\d+) chars \(limit (\d+)\)$/, function(m){ return "「" + m[1] + "」描述有 " + m[2] + " 字符（上限 " + m[3] + "）"; }],
    [/^"(.+)" body is large \((\d+) lines, ~([\d,]+) tok\)$/, function(m){ return "「" + m[1] + "」正文过大（" + m[2] + " 行，约 " + m[3] + " tokens）"; }],
    [/^"(.+)" lives in a folder named "(.+)"$/, function(m){ return "「" + m[1] + "」所在目录名是「" + m[2] + "」"; }]
  ];
  var DETAIL_ZH_MAP = {
    "Both ship inside plugin bundles; if they fight for triggers, uninstall one of the plugins.": "两者都来自插件包；如果互相抢触发，卸载其中一个插件即可。",
    "The same skill is loaded twice from two plugin installs; disable or uninstall one copy.": "同一个技能被两份插件安装各加载了一次；停用或卸载其中一份即可。",
    "Both will compete for the same triggers; keep one or merge them.": "两者会争抢相同的触发条件，保留一个或合并。",
    "A bundled skill that never fires; uninstall the plugin if you don't need it.": "插件自带、从未触发的技能；用不到的话可以卸载这个插件。",
    "Its description still rides along in every conversation. Consider quarantining it.": "它的描述仍在每次对话里常驻，建议隔离。",
    "Without a description the agent cannot decide when to load this skill.": "没有描述，Agent 无法判断何时加载这个技能。",
    "Shorten the description; it is loaded into context on every conversation.": "请缩短描述，它在每次对话中都会被加载。",
    "Move reference material into separate files loaded on demand (progressive disclosure).": "把参考资料拆到按需加载的独立文件里（渐进式披露）。",
    "Ships inside a plugin bundle; only the plugin author can split it up.": "来自插件包，只有插件作者能拆分，你无需处理。",
    "Keep the frontmatter name and directory name aligned so usage stats and triggers stay unambiguous.": "让 frontmatter 里的 name 与目录名保持一致，用量统计和触发才不会混淆。"
  };
  var DETAIL_ZH = [
    [/^instructions ~([\d,]+) tok \+ (\d+) skill descriptions ~([\d,]+) tok(?:; heaviest: (.+))?$/, function(m){
      return "指令文件约 " + m[1] + " tok + " + m[2] + " 个技能描述约 " + m[3] + " tok" + (m[4] ? "；最重的：" + m[4] : "");
    }]
  ];
  var NOTE_ZH = [
    [/^found skills in (\d+) plugin bundle\(s\)$/, "在 $1 个插件包中发现技能"],
    [/^skipped (\d+) cached plugin\(s\) not enabled in config\.toml$/, "跳过了 $1 个只在缓存里、未在 config.toml 启用的插件"],
    [/^skipped (\d+) installed plugin\(s\) disabled in settings$/, "跳过了 $1 个已安装但在设置里停用的插件"],
    [/^parsed (\d+) session file\(s\) from the last (\d+) days$/, "解析了最近 $2 天的 $1 个会话文件"],
    [/^no session transcripts found in the last (\d+) days$/, "最近 $1 天没有找到会话记录"],
    [/^usage = exec calls reading a SKILL\.md \+ leading slash commands \(best effort\)$/, "用量依据：读取 SKILL.md 的命令调用 + 开头的斜杠命令（尽力估计）"],
    [/^usage = SKILL\.md path references in (conversation payloads|session parts|thread payloads) \(best effort\)$/, "用量依据：会话记录里对 SKILL.md 路径的引用（尽力估计）"],
    [/^usage = (.+) \(best effort\)$/, "用量依据：$1（尽力估计）"],
    [/^scanned (\d+) (conversation|session) database\(s\)(.*)$/, "扫描了 $1 个会话数据库$3"],
    [/^no skill invocations recorded in .+ — usage unknown$/, "本地会话里没有技能调用记录，用量未知"],
    [/^no local skill store — only instruction files are billed$/, "没有本地技能目录，只统计指令文件"],
    [/^custom prompts are counted as skills$/, "自定义 prompt 也按技能计"],
    [/^only (\d+) conversation\(s\) in the window — unused-skill detection needs (\d+)\+, skipped for now$/, "窗口内只有 $1 次会话，判断「从未使用」至少需要 $2 次，暂不判断、也不建议隔离"]
  ];
  function applyRules(s, rules){
    for (var i=0;i<rules.length;i++){
      var m = rules[i][0].exec(s);
      if (m) return typeof rules[i][1] === "function" ? rules[i][1](m) : s.replace(rules[i][0], rules[i][1]);
    }
    return s;
  }
  function trTitle(s){ return lang === "zh" ? applyRules(s, TITLE_ZH) : s; }
  function trDetail(s){ return lang === "zh" ? (DETAIL_ZH_MAP[s] || applyRules(s, DETAIL_ZH)) : s; }
  function trNote(s){ return lang === "zh" ? applyRules(s, NOTE_ZH) : s; }

  // ---------------------------------------------------- search & filter --
  var KINDS = [["unused","kUnused"],["duplicate","kDuplicate"],["convention","kConvention"],["token-bill","kBill"]];
  function haystack(f){
    // both languages are searchable regardless of the current view
    return (f.title + " " + applyRules(f.title, TITLE_ZH) + " " + f.detail + " " + (DETAIL_ZH_MAP[f.detail] || "") + " " + f.paths.join(" ")).toLowerCase();
  }
  function matches(f){
    if (state.sev === "action" && f.severity === "info") return false;
    if (state.sev !== "all" && state.sev !== "action" && f.severity !== state.sev) return false;
    if (state.kind !== "all" && f.kind !== state.kind) return false;
    if (state.query && haystack(f).indexOf(state.query) < 0) return false;
    return true;
  }
  function filtering(){ return state.query !== "" || state.sev !== "all" || state.kind !== "all"; }

  /** escape, then wrap case-insensitive hits of the current query in <mark> */
  function hl(s){
    var q = state.query, text = String(s);
    if (!q) return esc(text);
    var lower = text.toLowerCase(), out = "", i = 0, j;
    while ((j = lower.indexOf(q, i)) >= 0){
      out += esc(text.slice(i, j)) + "<mark>" + esc(text.slice(j, j + q.length)) + "</mark>";
      i = j + q.length;
    }
    return out + esc(text.slice(i));
  }

  // ------------------------------------------------------------ render --
  function ring(score, size, small){
    var sw = small?6:8, r = size/2 - sw/2 - 1, c = 2*Math.PI*r, col = gradeColor(score);
    return '<div class="ring-wrap" style="width:'+size+'px;height:'+size+'px" role="img" aria-label="'+esc(t("healthAria", score))+'">'
      + '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" aria-hidden="true">'
      + '<circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" fill="none" stroke="#ece2cf" stroke-width="'+sw+'"/>'
      + '<circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'"'
      + ' stroke-linecap="round" stroke-dasharray="'+(c*score/100).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 '+size/2+' '+size/2+')"/>'
      + '</svg>'
      + '<div class="ring-num'+(small?' small':'')+'"><b style="color:'+col+'">'+score+'</b>'+(small?'':'<span>'+esc(t("ringLabel"))+'</span>')+'</div>'
      + '</div>';
  }

  function findingHtml(f){
    var icon = f.severity==="error" ? "✖" : f.severity==="warn" ? "▲" : "·";
    var title = trTitle(f.title);
    var h = '<div class="finding">'
      + '<div class="f-title"'+(title !== f.title ? ' title="'+esc(f.title)+'"' : '')+'><span class="sev sev-'+f.severity+'">'+icon+'</span><span class="t">'+hl(title)+'</span></div>'
      + '<div class="f-detail">'+hl(trDetail(f.detail))+'</div>';
    for (var i=0;i<Math.min(2,f.paths.length);i++) h += '<div class="f-path">'+hl(f.paths[i])+'</div>';
    if (f.recoverableTokens>0 && f.severity!=="info") h += '<div class="f-save">'+esc(t("recoverable", loc(f.recoverableTokens)))+'</div>';
    return h + '</div>';
  }

  function agentHtml(a){
    var findings = a.findings || [];
    var h = '<div class="agent">'
      + '<div class="agent-head"><div><span class="agent-name">'+esc(a.name)+'</span><div class="agent-id">'+esc(a.id)+'</div></div>'
      + ring(a.score,64,true) + '</div>'
      + '<div class="agent-stats">'
      + '<span class="chip">'+esc(tn("cSkills", a.skillCount))+'</span>'
      + (a.instructionCount>0 ? '<span class="chip">'+esc(tn("cInstr", a.instructionCount))+'</span>' : '')
      + '<span class="chip">'+esc(t("cAlwaysOn", loc(a.alwaysOnTokens)))+'</span>'
      + '<span class="chip money">'+esc(t("cPer1k", usd(a.billPer1000)))+'</span>'
      + (a.conversations>0 ? '<span class="chip money">'+esc(t("cMonth", usd(a.monthlyCost)))+'</span>' : '')
      + '</div>';

    if (filtering()){
      var hits = findings.filter(matches);
      h += hits.length ? hits.map(findingHtml).join("") : '<div class="empty">'+esc(t("noHits"))+'</div>';
      return h + '</div>';
    }

    var actionable = findings.filter(function(f){return f.severity!=="info";});
    var info = findings.filter(function(f){return f.severity==="info";});
    if (actionable.length===0){
      h += '<div class="clean">' + esc(t(info.length ? "cleanAction" : "cleanAll")) + '</div>';
    } else {
      var showAll = state.expanded[a.id + ":act"];
      h += (showAll ? actionable : actionable.slice(0, PREVIEW)).map(findingHtml).join("");
      if (actionable.length > PREVIEW){
        h += '<button class="more-btn" data-toggle="'+esc(a.id)+':act">'
          + esc(showAll ? t("less") : tn("moreAct", actionable.length - PREVIEW)) + '</button>';
      }
    }
    if (info.length>0){
      var open = state.expanded[a.id + ":info"];
      h += '<button class="more-btn" data-toggle="'+esc(a.id)+':info">' + esc(tn(open ? "infoHide" : "infoShow", info.length)) + '</button>'
        + (open ? info.map(findingHtml).join("") : '');
    }
    if (a.notes && a.notes.length) h += '<div class="notes">'+ a.notes.map(function(n){ return esc(trNote(n)); }).join("<br>") +'</div>';
    return h + '</div>';
  }

  function heroHtml(r){
    var detected = r.agents.filter(function(a){return a.detected;});
    var monthly = r.totalMonthlyCost;
    return '<div class="hero">'
      + '<div class="hero-card">'+ring(r.score,112,false)
      + '<div><div class="hero-title">' + esc(t("heroTitle", grade(r.score))) + '</div>'
      + '<div class="hero-sub">' + tn("heroSub", detected.length, r.windowDays) + '</div></div></div>'
      + '<div class="stat-tiles">'
      + '<div class="tile"><div class="k">'+esc(t("tAlwaysOnK"))+'</div><div class="v">~'+loc(r.totalAlwaysOnTokens)+'</div><div class="n">'+esc(t("tAlwaysOnN"))+'</div></div>'
      + '<div class="tile"><div class="k">'+esc(t("tMonthlyK"))+'</div><div class="v">'+usd(monthly)+'</div><div class="n">'
      + esc(t(monthly < 1 ? "tMonthlySmall" : "tMonthlyBig")) + '</div></div>'
      + '<div class="tile'+(r.totalRecoverableTokens>0?'':' good')+'"><div class="k">'+esc(t("tRecoverK"))+'</div><div class="v">~'+loc(r.totalRecoverableTokens)+'</div><div class="n">'
      + esc(t(r.totalRecoverableTokens>0 ? "tRecoverN" : "tRecoverNone")) + '</div></div>'
      + '</div></div>';
  }

  function toolbarHtml(r){
    var all = [];
    r.agents.forEach(function(a){ if (a.detected) all = all.concat(a.findings || []); });
    function count(pred){ return all.filter(pred).length; }
    function chip(group, value, label, n){
      var on = state[group] === value;
      if (n === 0 && !on) return "";
      return '<button class="chip-btn" data-'+group+'="'+value+'" aria-pressed="'+on+'">'+esc(label)+(n===undefined?'':'<span class="c">'+n+'</span>')+'</button>';
    }
    return '<div class="toolbar">'
      + '<input class="search" id="search" type="search" placeholder="'+esc(t("searchPh"))+'" aria-label="'+esc(t("searchAria"))+'" value="'+esc(state.queryRaw || "")+'">'
      + '<div class="chips" role="group" aria-label="'+esc(t("sevAria"))+'">'
      + chip("sev","all",t("fAll"),all.length)
      + chip("sev","action",t("fAction"),count(function(f){return f.severity!=="info";}))
      + chip("sev","error",t("fError"),count(function(f){return f.severity==="error";}))
      + chip("sev","warn",t("fWarn"),count(function(f){return f.severity==="warn";}))
      + chip("sev","info",t("fInfo"),count(function(f){return f.severity==="info";}))
      + '</div>'
      + '<div class="chips" role="group" aria-label="'+esc(t("kindAria"))+'">'
      + chip("kind","all",t("fAllKinds"))
      + KINDS.map(function(k){ return chip("kind",k[0],t(k[1]),count(function(f){return f.kind===k[0];})); }).join("")
      + '</div>'
      + '<div class="result-count" id="result-count"></div>'
      + '</div>';
  }

  function renderAgents(){
    var r = state.report;
    var detected = r.agents.filter(function(a){return a.detected;});
    var absent = r.agents.filter(function(a){return !a.detected;});
    // while filtering, agents without a single hit drop out instead of showing empty cards
    var visible = filtering() ? detected.filter(function(a){ return (a.findings||[]).some(matches); }) : detected;
    var html = visible.map(agentHtml).join("");
    if (detected.length && !visible.length) html = '<div class="no-match">'+esc(t("noMatch"))+'</div>';
    if (!detected.length) html = '<div class="no-match">'+esc(t("noAgents"))+'</div>';
    $("agents").innerHTML = html;
    $("absent").innerHTML = absent.length
      ? esc(t("absent")) + absent.map(function(a){ return '<span class="chip">'+esc(a.name)+'</span>'; }).join("") : "";

    var rc = $("result-count");
    if (filtering()){
      var total = 0, hit = 0;
      detected.forEach(function(a){ (a.findings||[]).forEach(function(f){ total++; if (matches(f)) hit++; }); });
      rc.innerHTML = esc(t("showing", hit, total)) + '<button id="clear-filter">'+esc(t("clear"))+'</button>';
    } else {
      rc.innerHTML = "";
    }
    Array.prototype.forEach.call(document.querySelectorAll(".toolbar .chip-btn"), function(b){
      var group = b.hasAttribute("data-sev") ? "sev" : "kind";
      b.setAttribute("aria-pressed", String(state[group] === b.getAttribute("data-" + group)));
    });
  }

  function render(){
    var r = state.report;
    $("content").innerHTML = heroHtml(r)
      + '<div class="section-title">'+esc(t("sectionAgents"))+'</div>'
      + toolbarHtml(r)
      + '<div class="grid" id="agents"></div><div class="absent" id="absent"></div>';
    $("content").hidden = false;
    $("loading").hidden = true;
    renderAgents();
  }

  function loadingHtml(){
    return esc(t("loading")) + '<span class="dot">…</span><br><span class="loading-sub">' + esc(t("loadingSub")) + '</span>';
  }

  /** static chrome (header, footer, section titles) — re-run on language switch */
  function applyStatic(){
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = lang === "zh" ? "skill-slim · AI 技能包体检" : "skill-slim · agent skills health check";
    $("tagline").textContent = t("tagline");
    $("btn-plan").textContent = t("plan");
    $("btn-rescan").textContent = t("rescan");
    $("btn-lang").textContent = t("langSwitch");
    $("btn-lang").setAttribute("aria-label", t("langSwitchAria"));
    $("btn-lang").setAttribute("title", t("langSwitchAria"));
    $("q-title").textContent = t("quarantineTitle");
    $("footer-text").textContent = t("footer");
    if (!$("loading").hidden && $("loading").className === "loading") $("loading").innerHTML = loadingHtml();
  }

  function setLang(next){
    lang = next;
    try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
    applyStatic();
    if (state.report) render();
    if (state.quarantine) renderQuarantine(state.quarantine);
    var open = $("fix-panel");
    if (!open.hidden) closePlan(); // the plan panel is transient; reopen it in the new language if needed
  }

  // ------------------------------------------------------------ events --
  $("content").addEventListener("click", function(e){
    var b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-toggle")){
      var k = b.getAttribute("data-toggle"); state.expanded[k] = !state.expanded[k]; renderAgents();
    } else if (b.hasAttribute("data-sev")){
      state.sev = b.getAttribute("data-sev"); renderAgents();
    } else if (b.hasAttribute("data-kind")){
      state.kind = b.getAttribute("data-kind"); renderAgents();
    } else if (b.id === "clear-filter"){
      state.query = ""; state.queryRaw = ""; state.sev = "all"; state.kind = "all"; $("search").value = ""; renderAgents();
    }
  });
  var searchTimer;
  $("content").addEventListener("input", function(e){
    if (e.target.id !== "search") return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function(){
      state.queryRaw = e.target.value; state.query = e.target.value.trim().toLowerCase(); renderAgents();
    }, 120);
  });
  document.addEventListener("keydown", function(e){
    var s = $("search");
    if (e.key === "/" && s && document.activeElement !== s && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){
      e.preventDefault(); s.focus();
    } else if (e.key === "Escape" && s && document.activeElement === s){
      s.value = ""; state.query = ""; state.queryRaw = ""; renderAgents();
    }
  });

  // -------------------------------------------------------------- data --
  function loadScan(){
    $("content").hidden = true; $("loading").hidden = false; $("loading").className = "loading";
    $("loading").innerHTML = loadingHtml();
    $("btn-rescan").disabled = true;
    return api("/api/scan").then(function(data){
      state.report = data.report; render(); loadQuarantine();
    }).catch(function(e){
      $("loading").className = "loading error";
      $("loading").innerHTML = esc(t("scanFailed", e.message)) + '<br><span class="loading-sub">' + esc(t("retryHint")) + '</span>';
    }).then(function(){ $("btn-rescan").disabled = false; });
  }

  function renderQuarantine(list){
    var box = $("quarantine");
    if (!list.length){ box.innerHTML = '<div class="empty">'+esc(t("qEmpty"))+'</div>'; return; }
    box.innerHTML = list.map(function(e){
      return '<div class="q-item"><b>'+esc(e.name)+'</b><span class="chip">'+esc(e.agent)+'</span>'
        + '<span class="meta">'+esc(t("qFrom", e.originalPath, new Date(e.movedAt).toLocaleString(locale())))+'</span>'
        + '<button class="btn btn-ghost btn-sm" data-restore="'+esc(e.name)+'" data-agent="'+esc(e.agent)+'">'+esc(t("restore"))+'</button></div>';
    }).join("");
  }
  function loadQuarantine(){
    return api("/api/quarantine").then(function(list){
      state.quarantine = list; renderQuarantine(list);
    }).catch(function(e){
      $("quarantine").innerHTML = '<div class="empty">' + esc(t("qFailed", e.message)) + '</div>';
    });
  }
  $("quarantine").addEventListener("click", function(e){
    var btn = e.target.closest("[data-restore]");
    if (!btn) return;
    btn.disabled = true; btn.textContent = t("restoring");
    api("/api/restore",{method:"POST",headers:{"Content-Type":"application/json"},
      body: JSON.stringify({name: btn.getAttribute("data-restore"), agent: btn.getAttribute("data-agent")})})
    .then(function(res){
      if (res.restored && res.restored.length){
        toast(t("restored", res.restored.map(function(x){return x.name;}).join(lang === "zh" ? "、" : ", ")));
        loadScan();
      } else {
        toast(t("restoreSkipped", (res.skipped||[]).map(function(s){return s.reason;}).join("; ") || t("unknownReason")), true);
        loadQuarantine();
      }
    }).catch(function(err){ toast(t("restoreFail", err.message), true); loadQuarantine(); });
  });

  function closePlan(){ $("fix-panel").hidden = true; $("fix-panel").innerHTML = ""; }
  function showPanel(html){
    var box = $("fix-panel");
    box.innerHTML = html; box.hidden = false;
    box.firstChild.scrollIntoView({behavior:"smooth", block:"start"});
    var x = box.querySelector(".x"); if (x) x.addEventListener("click", closePlan);
  }
  function panelHead(title){
    return '<div class="panel"><h3>' + title + '<button class="x" aria-label="'+esc(t("close"))+'">×</button></h3>';
  }

  function showPlan(){
    var btn = $("btn-plan");
    btn.disabled = true; btn.textContent = t("computing");
    api("/api/fix/plan",{method:"POST"}).then(function(p){
      var moves = p.moves || [];
      var head = panelHead(esc(t("planTitle")) + (moves.length ? esc(tn("planCount", moves.length)) : ""));
      if (!moves.length){ showPanel(head + '<div class="empty">'+esc(t("planEmpty"))+'</div></div>'); return; }
      var h = head + moves.map(function(m){
        return '<div class="move"><span class="chip">'+esc(m.agent)+'</span><div style="min-width:0"><div>'+esc(baseName(m.from))
          + ' <span style="color:var(--terra)">'+esc(t("toQuarantine"))+'</span></div><div class="p">'+esc(m.from)+'</div></div>'
          + '<div style="margin-left:auto;white-space:nowrap;color:var(--sage);font-size:12px">~'+loc(m.recoverableTokens)+' tok</div></div>';
      }).join("");
      h += '<div class="upside">' + t("upside", loc(p.savingsTokens))
        + (p.monthlySavings>=0.01 ? t("upsideMonthly", usd(p.monthlySavings)) : '') + t("upsideTail") + '</div>'
        + '<div class="actions"><button class="btn btn-danger" id="btn-apply">'+esc(t("apply"))+'</button>'
        + '<button class="btn btn-ghost" id="btn-cancel">'+esc(t("cancel"))+'</button></div></div>';
      showPanel(h);
      $("btn-cancel").addEventListener("click", closePlan);
      $("btn-apply").addEventListener("click", function(){ applyPlan(moves); });
    }).catch(function(e){
      toast(t("planFail", e.message), true);
    }).then(function(){ btn.disabled = false; btn.textContent = t("plan"); });
  }

  function applyPlan(moves){
    if (!confirm(t("confirm", moves.length))) return;
    var b = $("btn-apply"); b.disabled = true; b.textContent = t("applying");
    api("/api/fix/apply",{method:"POST"}).then(function(res){
      var delta = "";
      if (res.report && res.beforeScore !== undefined){
        delta = '<div class="delta">' + t("delta", res.beforeScore, res.report.score, loc(res.beforeTokens), loc(res.report.totalAlwaysOnTokens)) + '</div>';
      }
      showPanel(panelHead(esc(t("resultTitle"))) + delta
        + '<div class="empty">' + esc(t("resultSummary", (res.moved||[]).length, (res.failed||[]).length)) + '</div></div>');
      loadScan();
    }).catch(function(e){
      b.disabled = false; b.textContent = t("apply");
      toast(t("applyFail", e.message), true);
    });
  }

  function baseName(p){ return String(p).split(/[\\/]/).pop(); }

  $("btn-rescan").addEventListener("click", loadScan);
  $("btn-plan").addEventListener("click", showPlan);
  $("btn-lang").addEventListener("click", function(){ setLang(lang === "zh" ? "en" : "zh"); });
  applyStatic();
  loadScan();
})();
`;
