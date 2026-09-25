export const MAX_COMMAND_ARGS_COUNT = 64;
export const MAX_COMMAND_ARG_BYTES = 4096;
export const MAX_COMMAND_TOTAL_ARGS_BYTES = 64 * 1024; // 64 KiB

export const DANGEROUS_PACKAGE_SCRIPTS = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
  "publish",
  "postpublish",
  "prepack",
  "postpack",
  "prepublishOnly",
]);

export const PROHIBITED_PACKAGE_MANAGER_COMMANDS = new Set([
  "install",
  "uninstall",
  "update",
  "publish",
  "login",
  "adduser",
  "token",
  "config",
  "exec",
  "npx",
  "dlx",
  "add",
  "remove",
]);

export const PROHIBITED_NODE_FLAGS = new Set([
  "-e",
  "--eval",
  "-p",
  "--print",
]);

export const PROHIBITED_PYTHON_FLAGS = new Set([
  "-c",
  "-m",
]);

export const PROHIBITED_SHELL_EXECUTABLES = new Set([
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "bash",
  "sh",
  "zsh",
  "csh",
  "ksh",
]);

export const PROHIBITED_SHELL_ARGS = new Set([
  "/c",
  "/k",
  "-c",
  "-command",
  "--command",
]);

export const ALLOWED_TOOLCHAIN_EXECUTABLES = new Set([
  // JavaScript / TypeScript runtimes & package managers
  "node",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "deno",
  // Python
  "python",
  "python3",
  "py",
  "pip",
  "pip3",
  "uv",
  "pytest",
  // JVM
  "java",
  "javac",
  "mvn",
  "gradle",
  "gradlew",
  // Go
  "go",
  "golangci-lint",
  // Rust
  "rustc",
  "cargo",
  "cargo-clippy",
  "rustfmt",
  // PHP
  "php",
  "composer",
  // Ruby
  "ruby",
  "gem",
  "bundle",
  // .NET
  "dotnet",
  // C / C++ & Native Build
  "gcc",
  "g++",
  "clang",
  "clang++",
  "cmake",
  "make",
  "ninja",
  // Version Control
  "git",
  // Containers
  "docker",
  "docker-compose",
  // Shells (for controlled shell wrappers)
  "pwsh",
  "powershell",
  "cmd",
  "bash",
  "sh",
]);

export const EXTREME_DANGEROUS_COMMANDS = new Set([
  "format",
  "diskpart",
  "fdisk",
  "mkfs",
  "reg",
  "regedit",
  "shutdown",
  "reboot",
  "init",
  "poweroff",
  "halt",
  "bcdedit",
  "vssadmin",
  "wbadmin",
]);

export const PROHIBITED_COMMAND_INJECTION_PATTERN = /[;&|`$><\r\n]/;


export function validateCommandArguments(args?: string[]): { valid: boolean; reason?: string } {
  if (!args || !Array.isArray(args)) {
    return { valid: true };
  }

  if (args.length > MAX_COMMAND_ARGS_COUNT) {
    return {
      valid: false,
      reason: `Arguments count (${args.length}) exceeds maximum limit of ${MAX_COMMAND_ARGS_COUNT}`,
    };
  }

  let totalBytes = 0;
  for (let i = 0; i < args.length; i++) {
    const byteLen = Buffer.byteLength(args[i]!, "utf-8");
    if (byteLen > MAX_COMMAND_ARG_BYTES) {
      return {
        valid: false,
        reason: `Argument at index ${i} exceeds maximum limit of ${MAX_COMMAND_ARG_BYTES} bytes`,
      };
    }
    totalBytes += byteLen;
    if (totalBytes > MAX_COMMAND_TOTAL_ARGS_BYTES) {
      return {
        valid: false,
        reason: `Total arguments size exceeds maximum limit of ${MAX_COMMAND_TOTAL_ARGS_BYTES} bytes`,
      };
    }
  }

  return { valid: true };
}
