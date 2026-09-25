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
  EXTREME_DANGEROUS_COMMANDS,
  PROHIBITED_COMMAND_INJECTION_PATTERN,
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

      case "shell-command": {
        const cmd = spec.command.trim().toLowerCase();
        const firstArg = spec.args[0]?.trim().toLowerCase() ?? "";

        // inspect / version
        if (
          (cmd === "cargo" && (firstArg === "check" || firstArg === "clippy" || firstArg === "--version")) ||
          (cmd === "go" && (firstArg === "version" || firstArg === "vet")) ||
          (cmd === "dotnet" && (firstArg === "--version" || firstArg === "--info")) ||
          (cmd === "docker" && (firstArg === "ps" || firstArg === "version" || firstArg === "images")) ||
          firstArg === "--version" ||
          firstArg === "-v" ||
          firstArg === "version" ||
          firstArg === "status"
        ) {
          if (firstArg === "check" || firstArg === "clippy" || firstArg === "vet") return "typecheck";
          return "inspect";
        }

        // test
        if (
          firstArg === "test" ||
          firstArg.startsWith("test:") ||
          cmd === "pytest" ||
          cmd.includes("test")
        ) {
          return "test";
        }

        // lint
        if (
          firstArg === "lint" ||
          firstArg.startsWith("lint:") ||
          cmd === "eslint" ||
          cmd === "flake8" ||
          cmd === "pylint" ||
          cmd === "golangci-lint" ||
          cmd === "rustfmt"
        ) {
          return "lint";
        }

        // typecheck
        if (
          firstArg === "check" ||
          firstArg === "typecheck" ||
          cmd === "mypy" ||
          cmd === "pyright" ||
          cmd === "tsc"
        ) {
          return "typecheck";
        }

        // build / compile
        if (
          firstArg === "build" ||
          firstArg === "compile" ||
          firstArg === "publish" ||
          (cmd === "cargo" && firstArg === "build") ||
          (cmd === "go" && (firstArg === "build" || firstArg === "generate")) ||
          (cmd === "mvn" && (firstArg === "compile" || firstArg === "package")) ||
          (cmd === "gradle" && (firstArg === "build" || firstArg === "assemble")) ||
          (cmd === "dotnet" && (firstArg === "build" || firstArg === "publish")) ||
          cmd === "cmake" ||
          cmd === "make" ||
          cmd === "ninja" ||
          cmd === "gcc" ||
          cmd === "g++" ||
          cmd === "clang" ||
          cmd === "clang++"
        ) {
          return "build";
        }

        // package-install
        if (
          firstArg === "install" ||
          firstArg === "add" ||
          (cmd === "composer" && (firstArg === "install" || firstArg === "update" || firstArg === "require")) ||
          (cmd === "cargo" && (firstArg === "add" || firstArg === "install")) ||
          (cmd === "pip" && firstArg === "install") ||
          (cmd === "uv" && (firstArg === "pip" || firstArg === "add")) ||
          (cmd === "go" && firstArg === "get") ||
          (cmd === "dotnet" && (firstArg === "add" || firstArg === "restore")) ||
          (cmd === "gem" && firstArg === "install")
        ) {
          return "package-install";
        }

        // dev-server / long running
        if (
          firstArg === "dev" ||
          firstArg === "start" ||
          firstArg === "serve" ||
          firstArg === "watch" ||
          (cmd === "docker" && firstArg === "compose") ||
          cmd === "docker-compose"
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

      case "shell-command": {
        const cmd = spec.command.trim();
        const lowerCmd = cmd.toLowerCase();
        const baseCmd = lowerCmd.split(/[/\\]/).pop() ?? lowerCmd;

        // 1. Prohibited shell meta-characters / injection sequences
        const hasInjectionInCommand = PROHIBITED_COMMAND_INJECTION_PATTERN.test(spec.command);
        const hasInjectionInArgs =
          spec.args &&
          Array.isArray(spec.args) &&
          spec.args.some((arg) => PROHIBITED_COMMAND_INJECTION_PATTERN.test(arg));

        if (hasInjectionInCommand || hasInjectionInArgs) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: ["Command or arguments contain prohibited shell meta-characters or injection sequences"],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        // 2. Prohibited extreme dangerous commands
        if (EXTREME_DANGEROUS_COMMANDS.has(baseCmd)) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: [`Command "${spec.command}" is classified as an extremely dangerous system administration utility and is strictly prohibited`],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        // 3. Prohibited argument length and count
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

        // 4. Prohibited root deletion arguments
        if (spec.args && Array.isArray(spec.args)) {
          const joinedArgs = spec.args.map((a) => a.toLowerCase());
          if (
            (joinedArgs.includes("-rf") && (joinedArgs.includes("/") || joinedArgs.includes("/*") || joinedArgs.includes("c:\\") || joinedArgs.includes("c:/"))) ||
            (joinedArgs.includes("/s") && joinedArgs.includes("/q") && joinedArgs.some((a) => a.includes("c:\\")))
          ) {
            return {
              risk: "DANGEROUS",
              category,
              reasons: ["Destructive root filesystem modification command detected"],
              executesProjectCode: true,
              mayModifyFiles: true,
              mayAccessNetwork: true,
            };
          }
        }

        // 5. Allowed toolchain check
        const isAllowedTool =
          ALLOWED_TOOLCHAIN_EXECUTABLES.has(baseCmd) ||
          baseCmd.startsWith("./") ||
          baseCmd.startsWith(".\\");

        if (!isAllowedTool) {
          return {
            risk: "DANGEROUS",
            category,
            reasons: [`Executable '${spec.command}' is not in the allowed LocalBridge toolchain list`],
            executesProjectCode: true,
            mayModifyFiles: true,
            mayAccessNetwork: true,
          };
        }

        // 6. Safe inspection commands
        if (category === "inspect") {
          return {
            risk: "SAFE",
            category,
            reasons: [`Shell command "${spec.command}" runs a safe inspection without modifying project state`],
            executesProjectCode: false,
            mayModifyFiles: false,
            mayAccessNetwork: false,
          };
        }

        return {
          risk: "CAUTION",
          category,
          reasons: [`Shell command "${spec.command}" executes within project context`],
          executesProjectCode: true,
          mayModifyFiles: category === "build" || category === "package-install" || category === "package-script",
          mayAccessNetwork: true,
        };
      }

    }
  }


  classify(spec: CommandSpec): CommandRiskAssessment {
    return CommandClassifier.classify(spec);
  }
}
