export type AgentId = "claude-code" | "codex" | "gemini-cli" | "cursor";

export interface ScanContext {
  home: string;
  cwd: string;
  windowDays: number;
}

export interface Adapter {
  id: AgentId;
  name: string;
  hint: string;
  detect(ctx: { home: string }): Promise<boolean>;
  scan(ctx: ScanContext): Promise<AgentScan>;
}

export type SkillSource = "global" | "project" | "plugin" | "extension";

export interface Skill {
  agent: AgentId;
  name: string;
  /** Directory (or file) name the skill was discovered under. */
  dirName?: string;
  description: string;
  body: string;
  path: string;
  source: SkillSource;
}

/** Always-loaded instruction/context files: CLAUDE.md, AGENTS.md, always-apply rules... */
export interface ContextFile {
  agent: AgentId;
  label: string;
  path: string;
  content: string;
}

export interface UsageStat {
  count: number;
  lastUsed?: string;
}

export interface AgentScan {
  id: AgentId;
  name: string;
  detected: boolean;
  skills: Skill[];
  instructions: ContextFile[];
  /** Keyed by lowercase skill name. */
  usage: Map<string, UsageStat>;
  usageAvailable: boolean;
  /** Session/conversation files seen inside the usage window. */
  conversationCount: number;
  notes: string[];
}

export type FindingKind = "token-bill" | "duplicate" | "unused" | "convention";
export type Severity = "info" | "warn" | "error";

export interface Finding {
  agent: AgentId;
  kind: FindingKind;
  severity: Severity;
  title: string;
  detail: string;
  paths: string[];
  /** Tokens that could be recovered by acting on this finding. */
  recoverableTokens?: number;
}

export interface AgentReport {
  id: AgentId;
  name: string;
  detected: boolean;
  skillCount: number;
  instructionCount: number;
  alwaysOnTokens: number;
  /** Estimated USD cost of always-on context per 1000 conversations. */
  billPer1000: number;
  /** Conversation files observed inside the usage window (0 = unknown). */
  conversations: number;
  /** Estimated USD cost per month of always-on context at the observed pace. */
  monthlyCost: number;
  findings: Finding[];
  score: number;
  notes: string[];
}

export interface Report {
  generatedAt: string;
  windowDays: number;
  agents: AgentReport[];
  totalAlwaysOnTokens: number;
  totalBillPer1000: number;
  totalMonthlyCost: number;
  totalRecoverableTokens: number;
  score: number;
}
