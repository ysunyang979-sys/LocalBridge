import { EXTREME_DANGEROUS_COMMANDS } from "../command/rules.js";

export type TerminalCommandRisk = "SAFE" | "CAUTION" | "DANGEROUS";

export interface TerminalInputEvaluation {
  riskLevel: TerminalCommandRisk;
  commands: string[];
  requiresApproval: boolean;
  reasons: string[];
}

const SAFE_TERMINAL_COMMANDS = new Set([
  "dir",
  "ls",
  "pwd",
  "cd",
  "type",
  "cat",
  "echo",
  "whoami",
  "hostname",
  "date",
  "get-date",
  "clear",
  "cls",
  "help",
  "man",
]);

const SAFE_TOOL_FLAGS = new Set([
  "-v",
  "-version",
  "--version",
  "-h",
  "--help",
  "status",
  "diff",
  "log",
  "show",
  "branch",
  "list",
]);

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f?|-f?[a-zA-Z]*r)\b/i,
  /\bdel\s+\/[sq]/i,
  /\brd\s+\/[sq]/i,
  /\brmdir\s+\/[sq]/i,
  /\btaskkill\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\bnet\s+user\b/i,
  /\bnet\s+localgroup\b/i,
  /\bchmod\s+(-R\s+)?777\b/i,
  /\bchown\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\breg\s+(add|delete)\b/i,
  /\bvssadmin\b/i,
  /\bcurl\b.*\|\s*(bash|sh|pwsh|powershell)\b/i,
  /\bwget\b.*\|\s*(bash|sh|pwsh|powershell)\b/i,
];

/**
 * Splits terminal input stream into individual commands, taking into account
 * shell chaining operators (&&, ||, ;, |, and newlines).
 */
export function splitTerminalInput(input: string): string[] {
  // Normalize newlines
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const commands: string[] = [];

  for (const line of lines) {
    // Split by shell chain tokens: &&, ||, ;, |
    const parts = line.split(/&&|\|\||;|\|/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        commands.push(trimmed);
      }
    }
  }

  return commands.length > 0 ? commands : [input.trim()];
}

/**
 * Evaluates the security and risk level of terminal input.
 */
export function evaluateTerminalInput(
  input: string,
  projectRoot?: string
): TerminalInputEvaluation {
  const commands = splitTerminalInput(input);
  const reasons: string[] = [];
  let highestRisk: TerminalCommandRisk = "SAFE";

  for (const cmd of commands) {
    const tokens = cmd.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || !tokens[0]) continue;

    const cmdName = tokens[0];
    const baseCmd = cmdName.toLowerCase().split(/[/\\]/).pop() ?? "";
    const firstArg = tokens[1]?.toLowerCase() ?? "";

    // 1. Extreme dangerous command check
    if (EXTREME_DANGEROUS_COMMANDS.has(baseCmd)) {
      highestRisk = "DANGEROUS";
      reasons.push(`System-critical dangerous utility detected: "${baseCmd}"`);
      break;
    }

    // 2. Dangerous regex patterns
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(cmd)) {
        highestRisk = "DANGEROUS";
        reasons.push(`Potentially destructive operation pattern detected in "${cmd}"`);
        break;
      }
    }
    if (highestRisk === "DANGEROUS") break;

    // 3. Project boundary traversal check
    if (projectRoot && (cmd.includes("../..") || cmd.includes("..\\.."))) {
      highestRisk = "DANGEROUS";
      reasons.push(`Directory traversal outside project boundary detected in "${cmd}"`);
      break;
    }

    // 4. Check for safe command inspection
    const isSafeBase = SAFE_TERMINAL_COMMANDS.has(baseCmd);
    const isSafeFlag = SAFE_TOOL_FLAGS.has(firstArg);

    if (isSafeBase || isSafeFlag) {
      continue;
    }

    // 5. Default to CAUTION for development commands
    highestRisk = "CAUTION";
    reasons.push(`Command "${cmdName}" performs project state changes`);
  }

  const requiresApproval = highestRisk === "DANGEROUS";


  return {
    riskLevel: highestRisk,
    commands,
    requiresApproval,
    reasons,
  };
}
