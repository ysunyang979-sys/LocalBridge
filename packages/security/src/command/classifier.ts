import type { CommandSpec } from "@localbridge/protocol";
import type { CommandRiskAssessment } from "./types.js";
import {
  DANGEROUS_PACKAGE_SCRIPTS,
  PROHIBITED_PACKAGE_MANAGER_COMMANDS,
  PROHIBITED_NODE_FLAGS,
  PROHIBITED_PYTHON_FLAGS,
  validateCommandArguments,
} from "./rules.js";

export class CommandClassifier {
  /**
   * Classify a structured command specification into a risk assessment.
   */
  static classify(spec: CommandSpec): CommandRiskAssessment {
    switch (spec.kind) {
      case "tool-version":
        return {
          risk: "SAFE",
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
            reasons: [argValidation.reason || "Invalid command arguments"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        for (const arg of spec.args) {
          if (PROHIBITED_NODE_FLAGS.has(arg)) {
            return {
              risk: "DANGEROUS",
              reasons: [`Prohibited Node evaluation flag detected: "${arg}"`],
              executesProjectCode: true,
              mayModifyFiles: true,
              mayAccessNetwork: true,
            };
          }
        }

        return {
          risk: "CAUTION",
          reasons: [`Node script "${spec.path}" executes project code`],
          executesProjectCode: true,
          mayModifyFiles: true,
          mayAccessNetwork: true,
        };
      }

      case "python-script": {
        const normPath = spec.path.trim().toLowerCase();
        if (!normPath.endsWith(".py")) {
          return {
            risk: "DANGEROUS",
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
            reasons: [argValidation.reason || "Invalid command arguments"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        for (const arg of spec.args) {
          if (PROHIBITED_PYTHON_FLAGS.has(arg)) {
            return {
              risk: "DANGEROUS",
              reasons: [`Prohibited Python evaluation flag detected: "${arg}"`],
              executesProjectCode: true,
              mayModifyFiles: true,
              mayAccessNetwork: true,
            };
          }
        }

        return {
          risk: "CAUTION",
          reasons: [`Python script "${spec.path}" executes project code`],
          executesProjectCode: true,
          mayModifyFiles: true,
          mayAccessNetwork: true,
        };
      }

      case "package-script": {
        const scriptName = spec.script.trim().toLowerCase();

        if (DANGEROUS_PACKAGE_SCRIPTS.has(scriptName)) {
          return {
            risk: "DANGEROUS",
            reasons: [`Package script "${spec.script}" is classified as dangerous lifecycle script`],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        if (PROHIBITED_PACKAGE_MANAGER_COMMANDS.has(scriptName)) {
          return {
            risk: "DANGEROUS",
            reasons: [`Package manager command "${spec.script}" is prohibited in Phase 8`],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        if (scriptName.startsWith("-") || scriptName.includes("/") || scriptName.includes("\\")) {
          return {
            risk: "DANGEROUS",
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
            reasons: [argValidation.reason || "Invalid command arguments"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        return {
          risk: "CAUTION",
          reasons: [`Package script "${spec.script}" executes project code via ${spec.manager}`],
          executesProjectCode: true,
          mayModifyFiles: true,
          mayAccessNetwork: true,
        };
      }
    }
  }

  classify(spec: CommandSpec): CommandRiskAssessment {
    return CommandClassifier.classify(spec);
  }
}
