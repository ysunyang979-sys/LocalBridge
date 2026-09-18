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

export function validateCommandArguments(args: string[]): { valid: boolean; reason?: string } {
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
