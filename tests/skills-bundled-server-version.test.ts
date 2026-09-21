import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resourcesDir = path.resolve(__dirname, "../apps/desktop/src-tauri/resources");

describe("Bundled Production Server Skills Parity", () => {
  const bundledServerJs = path.join(resourcesDir, "server/index.js");
  const bundledNodeExe = path.join(resourcesDir, "runtime/node.exe");

  it("Bundled server bundle exists and has substantial size (>1MB)", () => {
    expect(fs.existsSync(bundledServerJs)).toBe(true);
    const stat = fs.statSync(bundledServerJs);
    expect(stat.size).toBeGreaterThan(1024 * 1024);
  });

  it("Bundled server contains all 3 skills MCP tools", () => {
    const serverCode = fs.readFileSync(bundledServerJs, "utf-8");
    expect(serverCode).toContain("localbridge_skill_list");
    expect(serverCode).toContain("localbridge_skill_get");
    expect(serverCode).toContain("localbridge_skill_match");
  });

  it("Bundled server contains skills REST routes and dynamic toolsCount calculation", () => {
    const serverCode = fs.readFileSync(bundledServerJs, "utf-8");
    expect(serverCode).toContain("/skills");
    expect(serverCode).toContain("getRegisteredToolsCount");
  });

  it("Bundled server imports cleanly with node without syntax or missing dependency errors", () => {
    const nodeBinary = fs.existsSync(bundledNodeExe) ? bundledNodeExe : process.execPath;
    const selfTestDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "skills-bundled-server-test-")
    );
    try {
      const stdout = execFileSync(
        nodeBinary,
        [
          "-e",
          "import('./index.js'); setTimeout(() => { console.log('BUNDLED_SERVER_VERIFIED_OK'); process.exit(0); }, 500);",
        ],
        {
          encoding: "utf-8",
          cwd: path.dirname(bundledServerJs),
          env: {
            ...process.env,
            LOCALBRIDGE_SERVER_PORT: "0",
            LOCALBRIDGE_SERVER_DB_PATH: path.join(selfTestDir, "selftest.db"),
            LOCALBRIDGE_LOG_LEVEL: "silent",
          },
        }
      );

      expect(stdout).toContain("BUNDLED_SERVER_VERIFIED_OK");
    } finally {
      try {
        fs.rmSync(selfTestDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
