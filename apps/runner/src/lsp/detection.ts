import fs from "node:fs";
import path from "node:path";
import nodeModule from "node:module";
import { fileURLToPath } from "node:url";

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
 * Search for Nexus bundled language server runtime.
 */
export function findBundledLsp(): { cliPath: string; tsserverPath?: string } | null {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const execDir = path.dirname(process.execPath);

  const candidateDirs: string[] = [];

  // 1. Explicit environment variables
  if (process.env.LOCALBRIDGE_LSP_DIR) {
    candidateDirs.push(path.resolve(process.env.LOCALBRIDGE_LSP_DIR));
  }
  if (process.env.LOCALBRIDGE_RESOURCES_PATH) {
    candidateDirs.push(path.resolve(process.env.LOCALBRIDGE_RESOURCES_PATH, "lsp"));
  }

  // 2. Relative to process.execPath (e.g. <resources>/runtime/node.exe -> <resources>/lsp)
  candidateDirs.push(path.resolve(execDir, "../lsp"));
  candidateDirs.push(path.resolve(execDir, "resources/lsp"));

  // 3. Relative to runner bundle (e.g. <resources>/runner/index.js -> <resources>/lsp)
  candidateDirs.push(path.resolve(currentDir, "../lsp"));

  // 4. Relative to current working directory
  candidateDirs.push(path.resolve(process.cwd(), "../lsp"));
  candidateDirs.push(path.resolve(process.cwd(), "resources/lsp"));
  candidateDirs.push(path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/lsp"));

  // 5. Monorepo root candidate
  const monorepoRoot = path.resolve(currentDir, "../../..");
  candidateDirs.push(path.resolve(monorepoRoot, "apps/desktop/src-tauri/resources/lsp"));

  for (const dir of candidateDirs) {
    const cliCandidate = path.join(dir, "node_modules", "typescript-language-server", "lib", "cli.mjs");
    if (fs.existsSync(cliCandidate)) {
      const tsserverCandidate = path.join(dir, "node_modules", "typescript", "lib", "tsserver.js");
      return {
        cliPath: cliCandidate,
        tsserverPath: fs.existsSync(tsserverCandidate) ? tsserverCandidate : undefined,
      };
    }
  }

  // Dev fallback: require.resolve from runner or monorepo
  try {
    const req = nodeModule.createRequire(import.meta.url);
    const resolvedCli = req.resolve("typescript-language-server/lib/cli.mjs", {
      paths: [currentDir, process.cwd(), monorepoRoot, path.resolve(monorepoRoot, "apps/runner")],
    });
    if (fs.existsSync(resolvedCli)) {
      let resolvedTsserver: string | undefined;
      try {
        const tsPath = req.resolve("typescript/lib/tsserver.js", {
          paths: [currentDir, process.cwd(), monorepoRoot, path.resolve(monorepoRoot, "apps/runner")],
        });
        if (fs.existsSync(tsPath)) resolvedTsserver = tsPath;
      } catch {}
      return {
        cliPath: resolvedCli,
        tsserverPath: resolvedTsserver,
      };
    }
  } catch {}

  // Virtual store search in dev (pnpm)
  const pnpmDir = path.resolve(monorepoRoot, "node_modules/.pnpm");
  if (fs.existsSync(pnpmDir)) {
    try {
      const entries = fs.readdirSync(pnpmDir);
      const lspEntry = entries.find((e) => e.startsWith("typescript-language-server@"));
      const tsEntry = entries.find((e) => e.startsWith("typescript@"));
      if (lspEntry) {
        const cliCandidate = path.join(pnpmDir, lspEntry, "node_modules/typescript-language-server/lib/cli.mjs");
        if (fs.existsSync(cliCandidate)) {
          let tsserverCandidate: string | undefined;
          if (tsEntry) {
            const tsPath = path.join(pnpmDir, tsEntry, "node_modules/typescript/lib/tsserver.js");
            if (fs.existsSync(tsPath)) tsserverCandidate = tsPath;
          }
          return { cliPath: cliCandidate, tsserverPath: tsserverCandidate };
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Resolve the language server executable and CLI path for TypeScript/JavaScript.
 * Priority:
 * 1. Project local dependencies (typescript-language-server in project node_modules)
 * 2. Nexus bundled runtime dependencies (<resources>/lsp)
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
  const localTsserver = path.join(
    projectRoot,
    "node_modules",
    "typescript",
    "lib",
    "tsserver.js"
  );

  if (fs.existsSync(localCli)) {
    const args = [localCli, "--stdio"];
    return {
      executable: nodeExe,
      args,
      serverKind: "typescript",
      languageId: "typescript",
      tsserverPath: fs.existsSync(localTsserver) ? localTsserver : undefined,
    };
  }

  // 2. Check bundled / runner runtime dependencies
  const bundled = findBundledLsp();
  if (bundled) {
    const args = [bundled.cliPath, "--stdio"];
    // Prefer project's own typescript if available, otherwise bundled tsserver
    const tsserverPath = fs.existsSync(localTsserver) ? localTsserver : bundled.tsserverPath;
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
