import fs from "node:fs";
import path from "node:path";
import nodeModule from "node:module";

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);

export interface LanguageServerResolution {
  executable: string;
  args: string[];
  serverKind: "typescript";
  languageId: "typescript" | "javascript";
  tsserverPath?: string;
}

/**
 * Detect language ID from file extension.
 */
export function detectLanguageFromPath(filePath: string): "typescript" | "javascript" | null {
  const ext = path.extname(filePath).toLowerCase();
  if (TS_EXTENSIONS.has(ext)) return "typescript";
  if (JS_EXTENSIONS.has(ext)) return "javascript";
  return null;
}

/**
 * Check if a project contains TypeScript/JavaScript configs or files.
 */
export function isTypeScriptProject(projectRoot: string): boolean {
  if (
    fs.existsSync(path.join(projectRoot, "tsconfig.json")) ||
    fs.existsSync(path.join(projectRoot, "jsconfig.json")) ||
    fs.existsSync(path.join(projectRoot, "package.json"))
  ) {
    return true;
  }
  return false;
}

/**
 * Resolve the language server executable and CLI path for TypeScript/JavaScript.
 * Priority:
 * 1. Project local dependencies
 * 2. Nexus bundled/runtime dependencies
 * 3. Returns null (LSP_NOT_AVAILABLE)
 */
export function resolveTypeScriptLanguageServer(
  projectRoot: string
): LanguageServerResolution | null {
  const nodeExe = process.execPath;

  // 1. Check project-local node_modules/typescript-language-server
  const localCli = path.join(
    projectRoot,
    "node_modules",
    "typescript-language-server",
    "lib",
    "cli.mjs"
  );
  if (fs.existsSync(localCli)) {
    const localTsserver = path.join(
      projectRoot,
      "node_modules",
      "typescript",
      "lib",
      "tsserver.js"
    );
    const args = [localCli, "--stdio"];
    return {
      executable: nodeExe,
      args,
      serverKind: "typescript",
      languageId: "typescript",
      tsserverPath: fs.existsSync(localTsserver) ? localTsserver : undefined,
    };
  }

  // 2. Check bundled / runner dependencies
  const req = nodeModule.createRequire(import.meta.url);
  let bundledCli: string | null = null;
  try {
    bundledCli = req.resolve("typescript-language-server/lib/cli.mjs", {
      paths: [projectRoot, path.resolve(path.dirname(import.meta.url), "../.."), process.cwd()],
    });
  } catch {
    // Try node_modules directly
    const fallback = path.resolve(
      process.cwd(),
      "node_modules/typescript-language-server/lib/cli.mjs"
    );
    if (fs.existsSync(fallback)) {
      bundledCli = fallback;
    }
  }

  if (bundledCli && fs.existsSync(bundledCli)) {
    const args = [bundledCli, "--stdio"];

    // Find tsserver.js (check project first, then fallback to bundled)
    let tsserverPath: string | undefined;
    const localTsserver = path.join(
      projectRoot,
      "node_modules",
      "typescript",
      "lib",
      "tsserver.js"
    );
    if (fs.existsSync(localTsserver)) {
      tsserverPath = localTsserver;
    } else {
      try {
        const bundledTsserver = req.resolve("typescript/lib/tsserver.js", {
          paths: [projectRoot, path.resolve(path.dirname(import.meta.url), "../.."), process.cwd()],
        });
        if (fs.existsSync(bundledTsserver)) {
          tsserverPath = bundledTsserver;
        }
      } catch {
        // Let typescript-language-server attempt its own resolution
      }
    }

    return {
      executable: nodeExe,
      args,
      serverKind: "typescript",
      languageId: "typescript",
      tsserverPath,
    };
  }

  return null;
}
