import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child_process from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const EXPECTED_NODE_VERSION = "v24.21.0";
const EXPECTED_NODE_SHA256 = "ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32";

const resourcesDir = path.resolve(rootDir, "apps/desktop/src-tauri/resources");
const runtimeDir = path.join(resourcesDir, "runtime");
const serverDir = path.join(resourcesDir, "server");
const runnerDir = path.join(resourcesDir, "runner");

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

async function main() {
  console.log("=== LocalBridge Bundled Runtime Preparation ===");

  // 1. Prepare target directories
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(runnerDir, { recursive: true });

  // 2. Locate and verify Node.js binary
  const nodeSrc = process.execPath;
  console.log(`Checking Node.js source at: ${nodeSrc}`);
  
  const versionOutput = child_process.execFileSync(nodeSrc, ["-v"]).toString().trim();
  console.log(`Node version: ${versionOutput}`);
  if (versionOutput !== EXPECTED_NODE_VERSION) {
    throw new Error(`Expected Node version ${EXPECTED_NODE_VERSION}, got ${versionOutput}`);
  }

  const nodeBuffer = fs.readFileSync(nodeSrc);
  const nodeHash = crypto.createHash("sha256").update(nodeBuffer).digest("hex").toLowerCase();
  console.log(`Node SHA-256: ${nodeHash}`);
  if (nodeHash !== EXPECTED_NODE_SHA256) {
    throw new Error(`Node SHA-256 mismatch! Expected ${EXPECTED_NODE_SHA256}, got ${nodeHash}`);
  }

  const destNodeExe = path.join(runtimeDir, "node.exe");
  fs.copyFileSync(nodeSrc, destNodeExe);
  console.log(`-> Copied verified node.exe (${nodeBuffer.length} bytes) to ${destNodeExe}`);

  // 3. Bundle Server
  console.log("\nBundling @localbridge/server...");
  const serverEntry = path.resolve(rootDir, "apps/server/src/index.ts");
  const serverOut = path.join(serverDir, "index.js");

  child_process.execSync(
    `npx esbuild "${serverEntry}" --bundle --platform=node --format=esm --target=node24 --external:better-sqlite3 --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile="${serverOut}"`,
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
  if (fs.existsSync(prebuildsSrc)) {
    fs.cpSync(prebuildsSrc, path.join(destBetterSqlite, "prebuilds"), { recursive: true });
  }

  const destRelease = path.join(destBetterSqlite, "build/Release");
  fs.mkdirSync(destRelease, { recursive: true });

  const win32Node = path.join(betterSqlite3Root, "prebuilds/win32-x64.node");
  if (fs.existsSync(win32Node)) {
    fs.copyFileSync(win32Node, path.join(destRelease, "better_sqlite3.node"));
  } else {
    const buildReleaseNode = path.join(betterSqlite3Root, "build/Release/better_sqlite3.node");
    if (fs.existsSync(buildReleaseNode)) {
      fs.copyFileSync(buildReleaseNode, path.join(destRelease, "better_sqlite3.node"));
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
    JSON.stringify({ name: "@localbridge/server-runtime", type: "module" }, null, 2),
    "utf-8"
  );

  // 4. Bundle Runner
  console.log("\nBundling @localbridge/runner...");
  const runnerEntry = path.resolve(rootDir, "apps/runner/src/index.ts");
  const runnerOut = path.join(runnerDir, "index.js");

  child_process.execSync(
    `npx esbuild "${runnerEntry}" --bundle --platform=node --format=esm --target=node24 --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile="${runnerOut}"`,
    { cwd: rootDir, stdio: "inherit" }
  );

  fs.writeFileSync(
    path.join(runnerDir, "package.json"),
    JSON.stringify({ name: "@localbridge/runner-runtime", type: "module" }, null, 2),
    "utf-8"
  );
  console.log(`-> Bundled runner to ${runnerOut}`);

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
  const serverImportTest = child_process.execFileSync(destNodeExe, [
    "-e",
    "import('./index.js'); setTimeout(() => { console.log('SERVER_IMPORT_OK'); process.exit(0); }, 500);",
  ], { cwd: serverDir, env: { ...process.env, LOCALBRIDGE_SERVER_PORT: "0", LOCALBRIDGE_LOG_LEVEL: "silent" } }).toString().trim();

  console.log(`Server import verification: ${serverImportTest}`);

  // 7. Test starting runner import with bundled node.exe
  const runnerImportTest = child_process.execFileSync(destNodeExe, [
    "-e",
    "import('./index.js'); setTimeout(() => { console.log('RUNNER_IMPORT_OK'); process.exit(0); }, 500);",
  ], { cwd: runnerDir, env: { ...process.env, LOCALBRIDGE_RUNNER_TOKEN: "lbr_test_test_test_test_test_test_123", LOCALBRIDGE_SERVER_URL: "ws://127.0.0.1:1/ignore", LOCALBRIDGE_LOG_LEVEL: "silent" } }).toString().trim();

  console.log(`Runner import verification: ${runnerImportTest}`);

  console.log("\n=== Self-Contained Runtime Resources Successfully Prepared! ===");
}

main().catch((err) => {
  console.error("Preparation failed:", err);
  process.exit(1);
});
