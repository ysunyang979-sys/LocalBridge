import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child_process from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const nodeMetadata = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, "scripts/bundled-node.json"), "utf-8")
) as { version: string; platform: string; arch: string; sha256: string };
const EXPECTED_NODE_VERSION = `v${nodeMetadata.version}`;
const EXPECTED_NODE_SHA256 = nodeMetadata.sha256;

const resourcesDir = path.resolve(rootDir, "apps/desktop/src-tauri/resources");
const runtimeDir = path.join(resourcesDir, "runtime");
const serverDir = path.join(resourcesDir, "server");
const runnerDir = path.join(resourcesDir, "runner");
const tunnelDir = path.join(resourcesDir, "tunnel");
const bridgeDir = path.join(resourcesDir, "bridge");
const lspDir = path.join(resourcesDir, "lsp");
const skillsDir = path.join(resourcesDir, "skills");
const rootSkillsDir = path.resolve(rootDir, "resources/skills");

function findPnpmPackage(packageName: string, preferredVersion?: string): string {
  const pnpmDir = path.resolve(rootDir, "node_modules/.pnpm");
  if (!fs.existsSync(pnpmDir)) {
    throw new Error(`pnpm virtual store not found at ${pnpmDir}`);
  }
  const entries = fs.readdirSync(pnpmDir);
  const matches = entries.filter((e) => e.startsWith(packageName.replace("/", "+") + "@") || e.startsWith(packageName + "@"));
  if (preferredVersion) {
    const pref = matches.find((m) => m.includes(`@${preferredVersion}`));
    if (pref) return path.join(pnpmDir, pref, "node_modules", packageName);
  }
  matches.sort().reverse();
  const match = matches[0];
  if (!match) {
    throw new Error(`Package ${packageName} not found in ${pnpmDir}`);
  }
  const pkgPath = path.join(pnpmDir, match, "node_modules", packageName);
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Expected package path does not exist: ${pkgPath}`);
  }
  return pkgPath;
}

function getEsbuildRunner(): string {
  try {
    const esbuildPkg = findPnpmPackage("esbuild");
    const esbuildBin = path.join(esbuildPkg, "bin/esbuild");
    if (fs.existsSync(esbuildBin)) {
      const header = fs.readFileSync(esbuildBin).slice(0, 32).toString("utf-8");
      if (header.startsWith("#!") || header.includes("use strict")) {
        return `node "${esbuildBin}"`;
      } else {
        try {
          fs.chmodSync(esbuildBin, 0o755);
        } catch {}
        return `"${esbuildBin}"`;
      }
    }
  } catch {}
  return "pnpm exec esbuild";
}

async function main() {
  console.log("=== LocalBridge Bundled Runtime Preparation ===");

  // 1. Clean only the controlled build outputs. This makes preparation
  // deterministic and prevents stale runtime or database files being shipped.
  for (const controlledDir of [runtimeDir, serverDir, runnerDir, bridgeDir, lspDir, skillsDir]) {
    const relative = path.relative(resourcesDir, controlledDir);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Refusing to clean uncontrolled resource path: ${controlledDir}`);
    }
    fs.rmSync(controlledDir, { recursive: true, force: true });
  }

  // Prepare target directories
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(runnerDir, { recursive: true });
  fs.mkdirSync(bridgeDir, { recursive: true });
  fs.mkdirSync(lspDir, { recursive: true });

  // Ensure workspace packages are freshly built from source before bundling server/runner.
  // Rebuilding packages is fast (<2s) and eliminates stale package bundle drift.
  console.log("Building workspace packages to ensure latest code is bundled...");
  child_process.execSync("pnpm -r --filter=./packages/* run build", { cwd: rootDir, stdio: "inherit" });

  // 2. Locate and verify Node.js binary
  const nodeSrc = process.execPath;
  console.log(`Checking Node.js source at: ${nodeSrc}`);
  
  const versionOutput = child_process.execFileSync(nodeSrc, ["-v"]).toString().trim();
  console.log(`Node version: ${versionOutput}`);
  
  const isWin = process.platform === "win32";
  if (isWin) {
    if (versionOutput !== EXPECTED_NODE_VERSION) {
      throw new Error(`Expected Node version ${EXPECTED_NODE_VERSION}, got ${versionOutput}`);
    }
    const nodeBuffer = fs.readFileSync(nodeSrc);
    const nodeHash = crypto.createHash("sha256").update(nodeBuffer).digest("hex").toLowerCase();
    console.log(`Node SHA-256: ${nodeHash}`);
    if (nodeHash !== EXPECTED_NODE_SHA256) {
      throw new Error(`Node SHA-256 mismatch! Expected ${EXPECTED_NODE_SHA256}, got ${nodeHash}`);
    }
  } else {
    if (!versionOutput.startsWith("v24.")) {
      console.warn(`Non-Windows Node version: ${versionOutput}`);
    }
  }

  const nodeExeName = isWin ? "node.exe" : "node";
  const destNodeExe = path.join(runtimeDir, nodeExeName);
  fs.copyFileSync(nodeSrc, destNodeExe);
  if (!isWin) {
    fs.chmodSync(destNodeExe, 0o755);
  }
  console.log(`-> Copied verified ${nodeExeName} to ${destNodeExe}`);

  // 3. Bundle Server
  console.log("\nBundling @localbridge/server...");
  const serverEntry = path.resolve(rootDir, "apps/server/src/index.ts");
  const serverOut = path.join(serverDir, "index.js");
  const esbuildCmd = getEsbuildRunner();

  child_process.execSync(
    `${esbuildCmd} "${serverEntry}" --bundle --platform=node --format=esm --target=node24 --external:better-sqlite3 --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile="${serverOut}"`,
    { cwd: rootDir, stdio: "inherit" }
  );

  // Copy migrations
  const migrationsSrc = path.resolve(rootDir, "apps/server/src/db/migrations");
  const migrationsDest = path.join(serverDir, "migrations");
  if (fs.existsSync(migrationsSrc)) {
    fs.cpSync(migrationsSrc, migrationsDest, { recursive: true });
    console.log(`-> Copied migrations to ${migrationsDest}`);
  }

  // Copy better-sqlite3 native addon and package
  console.log("Locating better-sqlite3 production native addon and dependencies...");
  const betterSqlite3Root = findPnpmPackage("better-sqlite3", "13.0.3");

  const serverNodeModules = path.join(serverDir, "node_modules");
  fs.mkdirSync(serverNodeModules, { recursive: true });

  // 3a. Copy better-sqlite3
  const destBetterSqlite = path.join(serverNodeModules, "better-sqlite3");
  fs.mkdirSync(destBetterSqlite, { recursive: true });
  fs.copyFileSync(path.join(betterSqlite3Root, "package.json"), path.join(destBetterSqlite, "package.json"));
  fs.cpSync(path.join(betterSqlite3Root, "lib"), path.join(destBetterSqlite, "lib"), { recursive: true });

  const prebuildsSrc = path.join(betterSqlite3Root, "prebuilds");
  const destRelease = path.join(destBetterSqlite, "build/Release");
  fs.mkdirSync(destRelease, { recursive: true });

  const targetPrebuild = path.join(betterSqlite3Root, "prebuilds", `${process.platform}-${process.arch}.node`);
  const buildReleaseNode = path.join(betterSqlite3Root, "build/Release/better_sqlite3.node");
  const win32Node = path.join(betterSqlite3Root, "prebuilds/win32-x64.node");

  if (fs.existsSync(targetPrebuild)) {
    fs.copyFileSync(targetPrebuild, path.join(destRelease, "better_sqlite3.node"));
    console.log(`-> Copied prebuilt better_sqlite3.node for ${process.platform}-${process.arch}`);
  } else if (fs.existsSync(buildReleaseNode)) {
    fs.copyFileSync(buildReleaseNode, path.join(destRelease, "better_sqlite3.node"));
    console.log(`-> Copied build/Release better_sqlite3.node`);
  } else if (isWin && fs.existsSync(win32Node)) {
    fs.copyFileSync(win32Node, path.join(destRelease, "better_sqlite3.node"));
    console.log(`-> Copied fallback win32-x64 better_sqlite3.node`);
  } else {
    const prebuildFiles = fs.existsSync(prebuildsSrc) ? fs.readdirSync(prebuildsSrc).filter((f) => f.endsWith(".node")) : [];
    if (prebuildFiles.length > 0) {
      fs.copyFileSync(path.join(prebuildsSrc, prebuildFiles[0]!), path.join(destRelease, "better_sqlite3.node"));
      console.log(`-> Copied fallback prebuild ${prebuildFiles[0]}`);
    }
  }

  // Also include bindings / file-uri-to-path if present
  try {
    const bindingsRoot = findPnpmPackage("bindings");
    const destBindings = path.join(serverNodeModules, "bindings");
    fs.mkdirSync(destBindings, { recursive: true });
    fs.copyFileSync(path.join(bindingsRoot, "package.json"), path.join(destBindings, "package.json"));
    fs.copyFileSync(path.join(bindingsRoot, "bindings.js"), path.join(destBindings, "bindings.js"));

    const fileUriRoot = findPnpmPackage("file-uri-to-path");
    const destFileUri = path.join(serverNodeModules, "file-uri-to-path");
    fs.mkdirSync(destFileUri, { recursive: true });
    fs.copyFileSync(path.join(fileUriRoot, "package.json"), path.join(destFileUri, "package.json"));
    fs.copyFileSync(path.join(fileUriRoot, "index.js"), path.join(destFileUri, "index.js"));
  } catch {
    // Optional for better-sqlite3 13+
  }

  console.log(`-> Packaged better-sqlite3 into ${serverNodeModules}`);

  // Server package.json
  fs.writeFileSync(
    path.join(serverDir, "package.json"),
    JSON.stringify({ name: "@localbridge/server-runtime", type: "module", license: "Apache-2.0" }, null, 2),
    "utf-8"
  );

  // 4. Bundle Runner
  console.log("\nBundling @localbridge/runner...");
  const runnerEntry = path.resolve(rootDir, "apps/runner/src/index.ts");
  const runnerOut = path.join(runnerDir, "index.js");

  child_process.execSync(
    `${esbuildCmd} "${runnerEntry}" --bundle --platform=node --format=esm --target=node24 --external:koffi --external:@koromix/koffi-win32-x64 --external:node-pty --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile="${runnerOut}"`,
    { cwd: rootDir, stdio: "inherit" }
  );

  const runnerNodeModules = path.join(runnerDir, "node_modules");
  fs.mkdirSync(runnerNodeModules, { recursive: true });

  try {
    const koffiRoot = findPnpmPackage("koffi");
    fs.cpSync(koffiRoot, path.join(runnerNodeModules, "koffi"), { recursive: true });
    console.log(`-> Packaged koffi into ${runnerNodeModules}`);
  } catch (err) {
    console.warn("Could not copy koffi:", err);
  }

  try {
    const pnpmDir = path.resolve(rootDir, "node_modules/.pnpm");
    const koromixDir = path.join(runnerNodeModules, "@koromix");
    fs.mkdirSync(koromixDir, { recursive: true });
    if (fs.existsSync(pnpmDir)) {
      const entries = fs.readdirSync(pnpmDir);
      for (const entry of entries) {
        if (entry.startsWith("@koromix+koffi-")) {
          const match = entry.match(/@koromix\+([a-zA-Z0-9_-]+)@/);
          if (match && match[1]) {
            const subName = match[1];
            const src = path.join(pnpmDir, entry, "node_modules/@koromix", subName);
            if (fs.existsSync(src)) {
              fs.cpSync(src, path.join(koromixDir, subName), { recursive: true });
              // Remove musl subdirectories to prevent linuxdeploy architecture mismatch on glibc Linux
              const muslX64 = path.join(koromixDir, subName, "musl_x64");
              if (fs.existsSync(muslX64)) fs.rmSync(muslX64, { recursive: true, force: true });
              const muslArm = path.join(koromixDir, subName, "musl_arm64");
              if (fs.existsSync(muslArm)) fs.rmSync(muslArm, { recursive: true, force: true });
              console.log(`-> Packaged @koromix/${subName} into ${runnerNodeModules}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Could not copy @koromix packages:", err);
  }

  try {
    const nodePtyRoot = findPnpmPackage("node-pty");
    fs.cpSync(nodePtyRoot, path.join(runnerNodeModules, "node-pty"), { recursive: true });
    console.log(`-> Packaged node-pty into ${runnerNodeModules}`);
  } catch (err) {
    console.warn("Could not copy node-pty:", err);
  }

  fs.writeFileSync(
    path.join(runnerDir, "package.json"),
    JSON.stringify({ name: "@localbridge/runner-runtime", type: "module", license: "Apache-2.0" }, null, 2),
    "utf-8"
  );
  console.log(`-> Bundled runner to ${runnerOut}`);

  // 4b. Prepare Tunnel Runtime
  const externalTunnelSource = path.resolve(rootDir, "../tunnel-client-runtime-cloudflared-v0.0.14-windows-amd64");
  if (!fs.existsSync(path.join(tunnelDir, "tunnel-client-runtime-cloudflared.exe")) && fs.existsSync(externalTunnelSource)) {
    console.log(`Copying tunnel runtime from ${externalTunnelSource} to ${tunnelDir}...`);
    fs.cpSync(externalTunnelSource, tunnelDir, { recursive: true });
  }

  // 4c. Prepare Bundled Language Server (typescript-language-server + typescript)
  console.log("\nBundling production Language Server dependencies...");
  const lspNodeModules = path.join(lspDir, "node_modules");
  fs.mkdirSync(lspNodeModules, { recursive: true });

  const tsLspRoot = findPnpmPackage("typescript-language-server");
  const destTsLsp = path.join(lspNodeModules, "typescript-language-server");
  fs.mkdirSync(destTsLsp, { recursive: true });
  fs.copyFileSync(path.join(tsLspRoot, "package.json"), path.join(destTsLsp, "package.json"));
  fs.cpSync(path.join(tsLspRoot, "lib"), path.join(destTsLsp, "lib"), { recursive: true });
  console.log(`-> Copied typescript-language-server to ${destTsLsp}`);

  const tsRoot = findPnpmPackage("typescript");
  const destTs = path.join(lspNodeModules, "typescript");
  fs.mkdirSync(destTs, { recursive: true });
  fs.copyFileSync(path.join(tsRoot, "package.json"), path.join(destTs, "package.json"));
  fs.cpSync(path.join(tsRoot, "lib"), path.join(destTs, "lib"), { recursive: true });
  if (fs.existsSync(path.join(tsRoot, "bin"))) {
    fs.cpSync(path.join(tsRoot, "bin"), path.join(destTs, "bin"), { recursive: true });
  }
  if (fs.existsSync(path.join(tsRoot, "LICENSE.txt"))) {
    fs.copyFileSync(path.join(tsRoot, "LICENSE.txt"), path.join(destTs, "LICENSE.txt"));
  }
  console.log(`-> Copied typescript to ${destTs}`);

  fs.writeFileSync(
    path.join(lspDir, "package.json"),
    JSON.stringify({ name: "@localbridge/lsp-runtime", type: "module", license: "Apache-2.0", private: true }, null, 2),
    "utf-8"
  );

  // 4d. Prepare Bundled Built-in Skills
  console.log("\nBundling production Built-in Skills...");
  if (fs.existsSync(rootSkillsDir)) {
    fs.cpSync(rootSkillsDir, skillsDir, { recursive: true });
    console.log(`-> Copied built-in skills to ${skillsDir}`);
  }

  // 4e. Prepare Bundled MCP Bridge
  console.log("\nBundling @localbridge/bridge (Nexus MCP Bridge)...");
  fs.mkdirSync(bridgeDir, { recursive: true });
  const bridgeEntry = path.resolve(rootDir, "apps/bridge/src/index.ts");
  const bridgeOut = path.join(bridgeDir, "index.js");

  child_process.execSync(
    `${esbuildCmd} "${bridgeEntry}" --bundle --platform=node --format=esm --target=node24 --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile="${bridgeOut}"`,
    { cwd: rootDir, stdio: "inherit" }
  );

  fs.writeFileSync(
    path.join(bridgeDir, "package.json"),
    JSON.stringify({ name: "@localbridge/bridge-runtime", type: "module", license: "Apache-2.0", private: true }, null, 2),
    "utf-8"
  );
  console.log(`-> Bundled MCP bridge to ${bridgeOut}`);

  // Compile standalone nexus-mcp-bridge launcher
  const launcherSrc = path.resolve(rootDir, "scripts/bridge-launcher.rs");
  const launcherExeName = isWin ? "nexus-mcp-bridge.exe" : "nexus-mcp-bridge";
  const launcherOut = path.join(bridgeDir, launcherExeName);
  if (fs.existsSync(launcherSrc)) {
    console.log(`Compiling standalone ${launcherExeName} launcher...`);
    child_process.execSync(`rustc -O "${launcherSrc}" -o "${launcherOut}"`, { cwd: rootDir, stdio: "inherit" });
    if (!isWin) {
      fs.chmodSync(launcherOut, 0o755);
    }
    const pdb = path.join(bridgeDir, "nexus-mcp-bridge.pdb");
    if (fs.existsSync(pdb)) fs.rmSync(pdb, { force: true });
    console.log(`-> Compiled standalone launcher to ${launcherOut}`);
  }

  // 5. Verification Test
  console.log("\nVerifying bundled runtime integrity using bundled node.exe...");
  const verifyResult = child_process.execFileSync(destNodeExe, [
    "-e",
    "const Database = require('./node_modules/better-sqlite3'); const db = new Database(':memory:'); const res = db.prepare('SELECT 100 as result').get(); console.log('BETTER_SQLITE_VERIFIED:', res.result);",
  ], { cwd: serverDir }).toString().trim();

  console.log(`Addon verification output: ${verifyResult}`);
  if (!verifyResult.includes("BETTER_SQLITE_VERIFIED: 100")) {
    throw new Error(`Native addon verification failed: ${verifyResult}`);
  }

  // 6. Test starting server import with bundled node.exe
  const tmpBase = process.env.TEMP || process.env.TMPDIR || "/tmp";
  const selfTestDir = fs.mkdtempSync(path.join(fs.realpathSync.native(path.resolve(tmpBase)), "localbridge-resource-selftest-"));
  let serverImportTest: string;
  try {
    serverImportTest = child_process.execFileSync(destNodeExe, [
      "-e",
      "import('./index.js'); setTimeout(() => { console.log('SERVER_IMPORT_OK'); process.exit(0); }, 500);",
    ], {
      cwd: serverDir,
      env: {
        ...process.env,
        LOCALBRIDGE_SERVER_PORT: "0",
        LOCALBRIDGE_SERVER_DB_PATH: path.join(selfTestDir, "selftest.db"),
        LOCALBRIDGE_LOG_LEVEL: "silent",
      },
    }).toString().trim();
  } finally {
    fs.rmSync(selfTestDir, { recursive: true, force: true });
  }

  console.log(`Server import verification: ${serverImportTest}`);

  // 7. Test starting runner import with bundled node.exe
  const runnerImportTest = child_process.execFileSync(destNodeExe, [
    "-e",
    "import('./index.js'); setTimeout(() => { console.log('RUNNER_IMPORT_OK'); process.exit(0); }, 500);",
  ], { cwd: runnerDir, env: { ...process.env, LOCALBRIDGE_RUNNER_TOKEN: "lbr_test_test_test_test_test_test_123", LOCALBRIDGE_SERVER_URL: "ws://127.0.0.1:1/ignore", LOCALBRIDGE_LOG_LEVEL: "silent" } }).toString().trim();

  console.log(`Runner import verification: ${runnerImportTest}`);

  // 7b. Test starting bridge import with bundled node.exe
  const bridgeImportTest = child_process.execFileSync(destNodeExe, [
    "-e",
    "import('./index.js'); setTimeout(() => { console.log('BRIDGE_IMPORT_OK'); process.exit(0); }, 500);",
  ], {
    cwd: bridgeDir,
    env: {
      ...process.env,
      PORT: "0",
      NEXUS_BRIDGE_PORT: "0",
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8787",
      NEXUS_CORE_URL: "http://127.0.0.1:18080",
    },
  }).toString().trim();
  console.log(`Bridge import verification: ${bridgeImportTest}`);

  // 8. Test bundled Language Server with bundled node.exe and sanitized/empty PATH
  const lspCliPath = path.join(destTsLsp, "lib/cli.mjs");
  const tsserverPath = path.join(destTs, "lib/tsserver.js");
  if (!fs.existsSync(lspCliPath) || !fs.existsSync(tsserverPath)) {
    throw new Error("Bundled LSP files missing after packaging!");
  }
  const lspVersion = child_process.execFileSync(destNodeExe, [lspCliPath, "--version"], {
    env: isWin
      ? { PATH: "", SystemRoot: process.env.SystemRoot || "C:\\Windows" }
      : { PATH: process.env.PATH || "" },
  }).toString().trim();
  console.log(`Language server verification (--version): ${lspVersion}`);
  if (!lspVersion.startsWith("6.")) {
    throw new Error(`Unexpected bundled typescript-language-server version: ${lspVersion}`);
  }

  const forbidden = fs.readdirSync(resourcesDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /(?:\.db|\.db-wal|\.db-shm|\.bak)$/i.test(entry.name));
  if (forbidden.length > 0) {
    throw new Error(`Forbidden database artifact found in packaged resources: ${forbidden[0]!.name}`);
  }

  console.log("\n=== Self-Contained Runtime Resources Successfully Prepared! ===");
}

main().catch((err) => {
  console.error("Preparation failed:", err);
  process.exit(1);
});
