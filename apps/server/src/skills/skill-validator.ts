import fs from "node:fs";
import { SkillYamlSchema, type SkillValidationStatus } from "@localbridge/protocol";

export interface SkillValidationResult {
  valid: boolean;
  status: SkillValidationStatus;
  errors: string[];
  securityWarning?: string;
}

const EXECUTABLE_FILE_REGEX = /\.(sh|bash|zsh|ps1|bat|cmd|exe|com|msi|vbs|vbe|js|mjs|cjs|py|rb|pl)$/i;

const DANGEROUS_PATTERNS = [
  {
    regex: /(ignore|bypass|override)\s+(nexus\s+)?(policy|policies|rules|security|emergency\s*stop)/i,
    message: "Claims to bypass Nexus security policies or emergency stop",
  },
  {
    regex: /(auto-?approve|automatically\s+approve)\s+(all|requests|operations)/i,
    message: "Claims to automatically approve all security-gated operations",
  },
  {
    regex: /(read|dump|exfiltrate)\s+(all\s+)?(secrets|tokens|credentials|passwords)/i,
    message: "Claims to exfiltrate or dump credentials",
  },
  {
    regex: /(elevate|escalate)\s+(privilege|scope|permission)/i,
    message: "Claims to escalate permissions or client scopes",
  },
  {
    regex: /绕过(nexus)?(安全|策略|紧急停止|审批)/i,
    message: "声明绕过安全策略或紧急停止",
  },
  {
    regex: /自动批准所有(请求|审批|操作)/i,
    message: "声明自动批准所有受控操作",
  },
];

export class SkillValidator {
  constructor(private readonly validMcpTools: ReadonlySet<string>) {}

  validate(
    skillDir: string,
    parsedYaml: unknown,
    markdownContent?: string
  ): SkillValidationResult {
    const errors: string[] = [];
    let securityWarning: string | undefined;

    // 1. Validate YAML structure with Zod schema
    const parseRes = SkillYamlSchema.safeParse(parsedYaml);
    if (!parseRes.success) {
      for (const issue of parseRes.error.issues) {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      }
      return {
        valid: false,
        status: "invalid",
        errors,
      };
    }

    const yaml = parseRes.data;

    // 2. Validate declared tools against active MCP tool registry
    for (const toolName of yaml.tools) {
      if (!this.validMcpTools.has(toolName)) {
        errors.push(`Declared tool '${toolName}' is not registered in the MCP Tool Registry`);
      }
    }

    // 3. Scan directory for forbidden executable code
    if (fs.existsSync(skillDir)) {
      try {
        const entries = fs.readdirSync(skillDir);
        for (const file of entries) {
          if (EXECUTABLE_FILE_REGEX.test(file)) {
            errors.push(`Executable files are strictly forbidden in skills: ${file}`);
          }
        }
      } catch (err: any) {
        errors.push(`Failed to read skill directory: ${err?.message || String(err)}`);
      }
    }

    // 4. Prompt Injection & Dangerous Instruction Scanning
    const combinedContent = `${JSON.stringify(yaml)}\n${markdownContent || ""}`;
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.regex.test(combinedContent)) {
        securityWarning = `Potential unsafe instructions: ${pattern.message}`;
        break;
      }
    }

    const valid = errors.length === 0;
    const status: SkillValidationStatus = !valid
      ? "invalid"
      : securityWarning
      ? "warning"
      : "valid";

    return {
      valid,
      status,
      errors,
      securityWarning,
    };
  }
}
