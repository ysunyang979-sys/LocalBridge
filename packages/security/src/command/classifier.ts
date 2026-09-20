import type { CommandSpec, CommandCategory } from "@localbridge/protocol";
import type { CommandRiskAssessment } from "./types.js";
import {
  DANGEROUS_PACKAGE_SCRIPTS,
  PROHIBITED_PACKAGE_MANAGER_COMMANDS,
  PROHIBITED_NODE_FLAGS,
  PROHIBITED_PYTHON_FLAGS,
  PROHIBITED_SHELL_EXECUTABLES,
  PROHIBITED_SHELL_ARGS,
  ALLOWED_TOOLCHAIN_EXECUTABLES,
  validateCommandArguments,
} from "./rules.js";

export class CommandClassifier {
  /**
   * Determine the command category based on command specification.
   */
  static classifyCategory(spec: CommandSpec): CommandCategory {
    switch (spec.kind) {
      case "tool-version":
        return "inspect";

      case "node-script": {
        const normPath = spec.path.toLowerCase();
        if (normPath.includes("test")) return "test";
        if (normPath.includes("lint")) return "lint";
        if (normPath.includes("typecheck") || normPath.includes("check") || normPath.includes("tsc")) return "typecheck";
        if (normPath.includes("build")) return "build";
        return "package-script";
      }

      case "python-script": {
        const normPath = spec.path.toLowerCase();
        if (normPath.includes("test")) return "test";
        if (normPath.includes("lint")) return "lint";
        if (normPath.includes("typecheck") || normPath.includes("check")) return "typecheck";
        if (normPath.includes("build")) return "build";
        return "package-script";
      }

      case "package-script": {
        const scriptName = spec.script.trim().toLowerCase();
        if (
          scriptName === "install" ||
          scriptName === "add" ||
          scriptName.startsWith("install:") ||
          scriptName.startsWith("add:")
        ) {
          return "package-install";
        }
        if (
          scriptName === "test" ||
          scriptName.startsWith("test:") ||
          scriptName.startsWith("test-") ||
          scriptName.endsWith(":test") ||
          scriptName.includes("test")
        ) {
          return "test";
        }
        if (
          scriptName === "lint" ||
          scriptName.startsWith("lint:") ||
          scriptName.startsWith("lint-") ||
          scriptName.endsWith(":lint") ||
          scriptName.includes("lint")
        ) {
          return "lint";
        }
        if (
          scriptName === "typecheck" ||
          scriptName === "check" ||
          scriptName === "tsc" ||
          scriptName.startsWith("typecheck:")
        ) {
          return "typecheck";
        }
        if (
          scriptName === "build" ||
          scriptName.startsWith("build:") ||
          scriptName.startsWith("build-") ||
          scriptName.endsWith(":build") ||
          scriptName.includes("build")
        ) {
          return "build";
        }
        if (
          scriptName === "dev" ||
          scriptName === "start" ||
          scriptName === "serve" ||
          scriptName.startsWith("dev:") ||
          scriptName.startsWith("start:")
        ) {
          return "dev-server";
        }
        return "package-script";
      }
    }
  }

  /**
   * Pre-execution validation against raw shell commands or unknown executables.
   */
  static checkRawCommand(executable: string, args: string[]): { isShell: boolean; isAllowed: boolean; reason?: string } {
    const baseName = executable.split(/[/\\]/).pop()?.toLowerCase() ?? "";
    const isShell = PROHIBITED_SHELL_EXECUTABLES.has(baseName);
    if (isShell) {
      return {
        isShell: true,
        isAllowed: false,
        reason: `Raw shell execution using '${baseName}' is strictly prohibited.`,
      };
    }

    const hasShellArg = args.some((arg) => PROHIBITED_SHELL_ARGS.has(arg.toLowerCase()));
    if (hasShellArg) {
      return {
        isShell: true,
        isAllowed: false,
        reason: "Arbitrary shell string evaluation flags are strictly prohibited.",
      };
    }

    const isAllowed = ALLOWED_TOOLCHAIN_EXECUTABLES.has(baseName);
    if (!isAllowed) {
      return {
        isShell: false,
        isAllowed: false,
        reason: `Executable '${baseName}' is not in the allowed LocalBridge toolchain list.`,
      };
    }

    return { isShell: false, isAllowed: true };
  }

  /**
   * Classify a structured command specification into a risk assessment.
   */
  static classify(spec: CommandSpec): CommandRiskAssessment {
    const category = this.classifyCategory(spec);

    switch (spec.kind) {
      case "tool-version":
        return {
          risk: "SAFE",
          category,
          reasons: [`Tool version inspection for "${spec.tool}" does not execute project code`],
          executesProjectCode: false,
          mayModifyFiles: false,
          mayAccessNetwork: false,
        };

      case "node-script": {
        const normPath = spec.path.trim().toLowerCase();
        if (!normPath.endsWith(".js") && !normPath.endsWith(".mjs") && !normPath.endsWith(".cjs")) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: ["Node script must have a valid JavaScript extension (.js, .mjs, .cjs)"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        const argValidation = validateCommandArguments(spec.args);
        if (!argValidation.valid) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: [argValidation.reason || "Invalid command arguments"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        if (spec.args && Array.isArray(spec.args)) {
          for (const arg of spec.args) {
            if (PROHIBITED_NODE_FLAGS.has(arg)) {
              return {
                risk: "DANGEROUS",
                category,
                reasons: [`Prohibited Node evaluation flag detected: "${arg}"`],
                executesProjectCode: true,
                mayModifyFiles: true,
                mayAccessNetwork: true,
              };
            }

            const lowerArg = arg.toLowerCase();
            for (const shell of PROHIBITED_SHELL_EXECUTABLES) {
              if (lowerArg === shell || lowerArg.endsWith(`/${shell}`) || lowerArg.endsWith(`\\${shell}`)) {
                return {
                  risk: "DANGEROUS",
                  category,
                  reasons: [`Raw shell invocation prohibited: "${arg}"`],
                  executesProjectCode: true,
                  mayModifyFiles: true,
                  mayAccessNetwork: true,
                };
              }
            }
            for (const prohibited of PROHIBITED_SHELL_ARGS) {
              if (lowerArg === prohibited) {
                return {
                  risk: "DANGEROUS",
                  category,
                  reasons: [`Prohibited shell argument: "${arg}"`],
                  executesProjectCode: true,
                  mayModifyFiles: true,
                  mayAccessNetwork: true,
                };
              }
            }
          }
        }

        return {
          risk: "CAUTION",
          category,
          reasons: [`Node script "${spec.path}" executes project code`],
          executesProjectCode: true,
          mayModifyFiles: category === "build" || category === "package-install",
          mayAccessNetwork: true,
        };
      }

      case "python-script": {
        const normPath = spec.path.trim().toLowerCase();
        if (!normPath.endsWith(".py")) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: ["Python script must have a valid Python extension (.py)"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        const argValidation = validateCommandArguments(spec.args);
        if (!argValidation.valid) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: [argValidation.reason || "Invalid command arguments"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        if (spec.args && Array.isArray(spec.args)) {
          for (const arg of spec.args) {
            if (PROHIBITED_PYTHON_FLAGS.has(arg)) {
              return {
                risk: "DANGEROUS",
                category,
                reasons: [`Prohibited Python evaluation flag detected: "${arg}"`],
                executesProjectCode: true,
                mayModifyFiles: true,
                mayAccessNetwork: true,
              };
            }

            const lowerArg = arg.toLowerCase();
            for (const shell of PROHIBITED_SHELL_EXECUTABLES) {
              if (lowerArg === shell || lowerArg.endsWith(`/${shell}`) || lowerArg.endsWith(`\\${shell}`)) {
                return {
                  risk: "DANGEROUS",
                  category,
                  reasons: [`Raw shell invocation prohibited: "${arg}"`],
                  executesProjectCode: true,
                  mayModifyFiles: true,
                  mayAccessNetwork: true,
                };
              }
            }
            for (const prohibited of PROHIBITED_SHELL_ARGS) {
              if (lowerArg === prohibited) {
                return {
                  risk: "DANGEROUS",
                  category,
                  reasons: [`Prohibited shell argument: "${arg}"`],
                  executesProjectCode: true,
                  mayModifyFiles: true,
                  mayAccessNetwork: true,
                };
              }
            }
          }
        }

        return {
          risk: "CAUTION",
          category,
          reasons: [`Python script "${spec.path}" executes project code`],
          executesProjectCode: true,
          mayModifyFiles: category === "build" || category === "package-install",
          mayAccessNetwork: true,
        };
      }

      case "package-script": {
        const scriptName = spec.script.trim().toLowerCase();

        if (DANGEROUS_PACKAGE_SCRIPTS.has(scriptName)) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: [`Package script "${spec.script}" is classified as dangerous lifecycle script`],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        if (PROHIBITED_PACKAGE_MANAGER_COMMANDS.has(scriptName) && category !== "package-install") {
          return {
            risk: "DANGEROUS",
            category,
            reasons: [`Package manager command "${spec.script}" is prohibited`],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        if (scriptName.startsWith("-") || scriptName.includes("/") || scriptName.includes("\\")) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: [`Invalid package script name "${spec.script}"`],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        const argValidation = validateCommandArguments(spec.args);
        if (!argValidation.valid) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: [argValidation.reason || "Invalid command arguments"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        if (spec.args && Array.isArray(spec.args)) {
          for (const arg of spec.args) {
            const lowerArg = arg.toLowerCase();
            for (const shell of PROHIBITED_SHELL_EXECUTABLES) {
              if (lowerArg === shell || lowerArg.endsWith(`/${shell}`) || lowerArg.endsWith(`\\${shell}`)) {
                return {
                  risk: "DANGEROUS",
                  category,
                  reasons: [`Raw shell invocation prohibited: "${arg}"`],
                  executesProjectCode: true,
                  mayModifyFiles: true,
                  mayAccessNetwork: true,
                };
              }
            }
            for (const prohibited of PROHIBITED_SHELL_ARGS) {
              if (lowerArg === prohibited) {
                return {
                  risk: "DANGEROUS",
                  category,
                  reasons: [`Prohibited shell argument: "${arg}"`],
                  executesProjectCode: true,
                  mayModifyFiles: true,
                  mayAccessNetwork: true,
                };
              }
            }
          }
        }

        return {
          risk: "CAUTION",
          category,
          reasons: [`Package script "${spec.script}" executes project code via ${spec.manager}`],
          executesProjectCode: true,
          mayModifyFiles: category === "build" || category === "package-install",
          mayAccessNetwork: true,
        };
      }
    }
  }

  classify(spec: CommandSpec): CommandRiskAssessment {
    return CommandClassifier.classify(spec);
  }
}
