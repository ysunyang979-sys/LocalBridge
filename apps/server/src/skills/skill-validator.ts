import fs from "node:fs";
import { SkillYamlSchema, type SkillValidationStatus } from "@localbridge/protocol";

export interface SkillValidationResult {
  valid: boolean;
  status: SkillValidationStatus;
  errors: string[];
  securityWarning?: string;
  executableFilesFound?: string[];
}

const EXECUTABLE_FILE_REGEX =
  /\.(sh|bash|zsh|ps1|bat|cmd|exe|com|msi|vbs|vbe|js|mjs|cjs|py|rb|pl|dll|node|jar|bin|app|so|dylib)$/i;

const FORBIDDEN_MANIFEST_EXEC_FIELDS = [
  "script",
  "command",
  "entrypoint",
  "hook",
  "execute",
  "exec",
  "runner",
  "run_script",
  "shell",
  "postinstall",
  "preinstall",
  "runtime",
];

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
    markdownContent?: string,
    options?: { isBuiltin?: boolean; strictExecutables?: boolean }
  ): SkillValidationResult {
    const errors: string[] = [];
    const executableFilesFound: string[] = [];
    let securityWarning: string | undefined;

    // 1. Check for forbidden executable manifest fields (declarative only)
    if (parsedYaml && typeof parsedYaml === "object") {
      const record = parsedYaml as Record<string, unknown>;
      for (const field of FORBIDDEN_MANIFEST_EXEC_FIELDS) {
        if (field in record && record[field] !== undefined) {
          errors.push(
            `Declarative only: executable manifest field '${field}' is strictly forbidden in skills`
          );
        }
      }
    }

    // 2. Validate YAML structure with Zod schema
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

    // 3. Built-in namespace protection for non-builtin skills
    if (options?.isBuiltin === false && yaml.id.startsWith("nexus.")) {
      errors.push("nexus.* 命名空间仅供 Nexus 官方内置技能使用。");
    }

    // 4. Validate declared tools against active MCP tool registry
    for (const toolName of yaml.tools) {
      if (!this.validMcpTools.has(toolName)) {
        errors.push(`未知 MCP Tool: ${toolName}`);
      }
    }

    // 5. Scan directory for forbidden or auxiliary executable code
    if (fs.existsSync(skillDir)) {
      try {
        const entries = fs.readdirSync(skillDir, { recursive: true });
        for (const entry of entries) {
          const fileName = typeof entry === "string" ? entry : (entry as any).name;
          if (EXECUTABLE_FILE_REGEX.test(fileName)) {
            executableFilesFound.push(fileName);
            if (options?.strictExecutables) {
              errors.push(`Executable files are strictly forbidden in skills: ${fileName}`);
            }
          }
        }
      } catch (err: any) {
        errors.push(`Failed to read skill directory: ${err?.message || String(err)}`);
      }
    }

    // 6. Prompt Injection & Dangerous Instruction Scanning
    const combinedContent = `${JSON.stringify(yaml)}\n${markdownContent || ""}`;
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.regex.test(combinedContent)) {
        securityWarning = `Potential unsafe instructions: ${pattern.message}`;
        break;
      }
    }

    if (executableFilesFound.length > 0 && !options?.strictExecutables && !securityWarning) {
      securityWarning = `发现 ${executableFilesFound.length} 个可执行资源。出于安全原因，这些文件不会被导入或执行。`;
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
      executableFilesFound: executableFilesFound.length > 0 ? executableFilesFound : undefined,
    };
  }
}
