/**
 * Shared i18n for everything skill-slim renders for humans outside the
 * terminal: the dashboard (client-side), the --html report and the wrapped
 * bill (server-side). English is the source language — findings and notes
 * are produced in English because the CLI and --json share them — and the
 * Chinese view translates them by template. Unknown text passes through
 * untranslated rather than disappearing.
 */

export type Lang = "en" | "zh";
export const LANGS: readonly Lang[] = ["en", "zh"];

export function parseLang(value: string | undefined): Lang | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith("zh")) return "zh";
  if (v.startsWith("en")) return "en";
  return null;
}

/**
 * Language for generated files: explicit choice, then SKILL_SLIM_LANG, then
 * the POSIX locale variables, then the OS/Intl locale; anything that is not
 * Chinese gets English.
 */
export function detectLang(explicit?: string, env: NodeJS.ProcessEnv = process.env): Lang {
  const chosen = parseLang(explicit) ?? parseLang(env.SKILL_SLIM_LANG);
  if (chosen) return chosen;
  for (const key of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
    const v = env[key];
    // "C" / "POSIX" mean "no preference", keep looking
    if (v && v !== "C" && v !== "POSIX" && !v.startsWith("C.")) return v.toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

/** "{0} skills" style templates */
export function fmt(template: string, ...args: (string | number)[]): string {
  return template.replace(/\{(\d)\}/g, (_, i) => String(args[Number(i)] ?? ""));
}

type Rule = [RegExp, string];

/**
 * Chinese templates for backend strings. Replacement strings use $1…$n;
 * `{src:$k}` is then mapped through `sources`. Kept as plain data (no
 * functions) so the same table is serialised into the dashboard script.
 */
export const ZH_RULES: {
  sources: Record<string, string>;
  title: Rule[];
  detailMap: Record<string, string>;
  detail: Rule[];
  note: Rule[];
} = {
  sources: { global: "全局", project: "项目", plugin: "插件", extension: "扩展" },
  title: [
    [/^Always-on context: ~([\d,]+) tokens$/, "常驻上下文：约 $1 tokens"],
    [/^"(.+)" overlaps "(.+)" \((\d+)% similar\)$/, "「$1」与「$2」功能重叠（相似度 $3%）"],
    [/^"(.+)" \((\w+)\) never invoked in the scan window$/, "「$1」（{src:$2}）在扫描窗口内从未被调用"],
    [/^"(.+)" has no description$/, "「$1」缺少描述"],
    [/^"(.+)" description is (\d+) chars \(limit (\d+)\)$/, "「$1」描述有 $2 字符（上限 $3）"],
    [/^"(.+)" body is large \((\d+) lines, ~([\d,]+) tok\)$/, "「$1」正文过大（$2 行，约 $3 tokens）"],
    [/^"(.+)" lives in a folder named "(.+)"$/, "「$1」所在目录名是「$2」"],
  ],
  detailMap: {
    "Both ship inside plugin bundles; if they fight for triggers, uninstall one of the plugins.":
      "两者都来自插件包；如果互相抢触发，卸载其中一个插件即可。",
    "The same skill is loaded twice from two plugin installs; disable or uninstall one copy.":
      "同一个技能被两份插件安装各加载了一次；停用或卸载其中一份即可。",
    "Both will compete for the same triggers; keep one or merge them.": "两者会争抢相同的触发条件，保留一个或合并。",
    "A bundled skill that never fires; uninstall the plugin if you don't need it.":
      "插件自带、从未触发的技能；用不到的话可以卸载这个插件。",
    "Its description still rides along in every conversation. Consider quarantining it.":
      "它的描述仍在每次对话里常驻，建议隔离。",
    "Without a description the agent cannot decide when to load this skill.": "没有描述，Agent 无法判断何时加载这个技能。",
    "Shorten the description; it is loaded into context on every conversation.": "请缩短描述，它在每次对话中都会被加载。",
    "Move reference material into separate files loaded on demand (progressive disclosure).":
      "把参考资料拆到按需加载的独立文件里（渐进式披露）。",
    "Ships inside a plugin bundle; only the plugin author can split it up.": "来自插件包，只有插件作者能拆分，你无需处理。",
    "Keep the frontmatter name and directory name aligned so usage stats and triggers stay unambiguous.":
      "让 frontmatter 里的 name 与目录名保持一致，用量统计和触发才不会混淆。",
  },
  detail: [
    [
      /^instructions ~([\d,]+) tok \+ (\d+) skill descriptions ~([\d,]+) tok; heaviest: (.+)$/,
      "指令文件约 $1 tok + $2 个技能描述约 $3 tok；最重的：$4",
    ],
    [/^instructions ~([\d,]+) tok \+ (\d+) skill descriptions ~([\d,]+) tok$/, "指令文件约 $1 tok + $2 个技能描述约 $3 tok"],
  ],
  note: [
    [/^found skills in (\d+) plugin bundle\(s\)$/, "在 $1 个插件包中发现技能"],
    [/^skipped (\d+) cached plugin\(s\) not enabled in config\.toml$/, "跳过了 $1 个只在缓存里、未在 config.toml 启用的插件"],
    [/^skipped (\d+) installed plugin\(s\) disabled in settings$/, "跳过了 $1 个已安装但在设置里停用的插件"],
    [/^skipped (\d+) plugin folder\(s\) not installed or disabled in config\.json$/, "跳过了 $1 个未在 config.json 安装或已停用的插件目录"],
    [/^(\d+) app-builtin skill\(s\) not billed \(loaded conditionally by Antigravity\)$/, "$1 个应用内置技能未计入常驻（由 Antigravity 按条件加载）"],
    [/^(\d+) on-demand rule\(s\) not billed \(model_decision \/ glob \/ manual\)$/, "$1 条按需加载的规则未计入常驻（model_decision / glob / manual）"],
    [/^(\d+) extension\(s\), (\d+) context file\(s\) counted$/, "统计了 $1 个扩展、$2 份上下文文件"],
    [/^no Antigravity conversation databases found$/, "未找到 Antigravity 会话数据库"],
    [/^could not open any of (\d+) conversation database\(s\)$/, "$1 个会话数据库均无法打开"],
    [/^no skill invocations recorded in Gemini CLI's local files — usage unknown$/, "Gemini CLI 本地文件不记录技能调用——用量未知"],
    [/^usage = view_file \/ read_file calls on SKILL\.md in the step log \(best effort\)$/, "用量依据：会话步骤里对 SKILL.md 的 view_file / read_file 调用（尽力估计）"],
    [/^parsed (\d+) session file\(s\) from the last (\d+) days$/, "解析了最近 $2 天的 $1 个会话文件"],
    [/^no session transcripts found in the last (\d+) days$/, "最近 $1 天没有找到会话记录"],
    [
      /^usage = exec calls reading a SKILL\.md \+ leading slash commands \(best effort\)$/,
      "用量依据：读取 SKILL.md 的命令调用 + 开头的斜杠命令（尽力估计）",
    ],
    [
      /^usage = SKILL\.md path references in (conversation payloads|session parts|thread payloads) \(best effort\)$/,
      "用量依据：会话记录里对 SKILL.md 路径的引用（尽力估计）",
    ],
    [/^usage = (.+) \(best effort\)$/, "用量依据：$1（尽力估计）"],
    [/^scanned (\d+) (conversation|session) database\(s\) \((\d+) unreadable\)$/, "扫描了 $1 个会话数据库（$3 个无法读取）"],
    [/^scanned (\d+) (conversation|session) database\(s\)$/, "扫描了 $1 个会话数据库"],
    [/^no skill invocations recorded in .+ — usage unknown$/, "本地会话里没有技能调用记录，用量未知"],
    [/^no local skill store — only instruction files are billed$/, "没有本地技能目录，只统计指令文件"],
    [/^custom prompts are counted as skills$/, "自定义 prompt 也按技能计"],
    [
      /^only (\d+) conversation\(s\) in the window — unused-skill detection needs (\d+)\+, skipped for now$/,
      "窗口内只有 $1 次会话，判断「从未使用」至少需要 $2 次，暂不判断、也不建议隔离",
    ],
  ],
};

function applyRules(s: string, rules: Rule[]): string {
  for (const [re, tpl] of rules) {
    if (re.test(s)) {
      return s.replace(re, tpl).replace(/\{src:(\w+)\}/g, (_, k: string) => ZH_RULES.sources[k] ?? k);
    }
  }
  return s;
}

/** Backend (English) finding/note text in the requested language. */
export function translate(kind: "title" | "detail" | "note", s: string, lang: Lang): string {
  if (lang !== "zh") return s;
  if (kind === "detail") return ZH_RULES.detailMap[s] ?? applyRules(s, ZH_RULES.detail);
  return applyRules(s, kind === "title" ? ZH_RULES.title : ZH_RULES.note);
}

/**
 * ZH_RULES as a JSON literal safe to inline in a <script> element (regexes
 * as [source, flags]; "<" escaped so no "</script>" can appear).
 */
export function zhRulesForClient(): string {
  const re = (rules: Rule[]) => rules.map(([r, t]) => [r.source, r.flags, t]);
  return JSON.stringify({
    sources: ZH_RULES.sources,
    title: re(ZH_RULES.title),
    detailMap: ZH_RULES.detailMap,
    detail: re(ZH_RULES.detail),
    note: re(ZH_RULES.note),
  }).replace(/</g, "\\u003c");
}
