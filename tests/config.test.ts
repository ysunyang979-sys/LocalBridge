import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, parseCliArgs } from "@localbridge/shared";

describe("Config Loader & Precedence", () => {
  let tmpDir: string;
  let tmpConfigFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-config-test-"));
    tmpConfigFile = path.join(tmpDir, "config.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads defaults when no config file, env, or cli args are provided", () => {
    const config = loadConfig({
      configPath: path.join(tmpDir, "non-existent.json"),
      env: {},
      cliArgs: [],
    });

    expect(config.server.host).toBe("127.0.0.1");
    expect(config.server.port).toBe(18080);
    expect(config.security.maxFileSize).toBe(2097152);
    expect(config.logging.level).toBe("info");
  });

  it("parses CLI arguments accurately", () => {
    const parsed = parseCliArgs([
      "--host",
      "0.0.0.0",
      "-p",
      "19090",
      "--db-path",
      "/var/data.db",
      "--log-level",
      "debug",
      "--pretty",
    ]);

    expect(parsed.serverHost).toBe("0.0.0.0");
    expect(parsed.serverPort).toBe(19090);
    expect(parsed.serverDbPath).toBe("/var/data.db");
    expect(parsed.logLevel).toBe("debug");
    expect(parsed.logPretty).toBe(true);
  });

  it("enforces precedence: Default < config.json < Env < CLI", () => {
    // 1. Write config.json
    fs.writeFileSync(
      tmpConfigFile,
      JSON.stringify({
        server: { host: "10.0.0.1", port: 18001 },
      })
    );

    // Test config.json overrides default
    let cfg = loadConfig({
      configPath: tmpConfigFile,
      env: {},
      cliArgs: ["-c", tmpConfigFile],
    });
    expect(cfg.server.host).toBe("10.0.0.1");
    expect(cfg.server.port).toBe(18001);

    // Test Env overrides config.json
    cfg = loadConfig({
      configPath: tmpConfigFile,
      env: {
        LOCALBRIDGE_SERVER_PORT: "18002",
      },
      cliArgs: ["-c", tmpConfigFile],
    });
    expect(cfg.server.port).toBe(18002);

    // Test CLI overrides Env and config.json
    cfg = loadConfig({
      configPath: tmpConfigFile,
      env: {
        LOCALBRIDGE_SERVER_PORT: "18002",
      },
      cliArgs: ["-c", tmpConfigFile, "--port", "18003"],
    });
    expect(cfg.server.port).toBe(18003);
  });

  it("rejects invalid configuration schema with clear diagnostics", () => {
    expect(() =>
      loadConfig({
        env: {
          LOCALBRIDGE_SERVER_PORT: "999999", // Port exceeds 65535
        },
        cliArgs: [],
      })
    ).toThrow(/Invalid LocalBridge configuration/);
  });
});
