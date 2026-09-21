import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getManagedLayaRuntimeDir,
  getManagedPythonPath,
  getManagedWorkerScriptPath,
  isManagedRuntimeAvailable,
  ensureManagedRuntime,
  resolveLayaExecutionEnvironment,
} from "../packages/security/src/intelligence/runtime.js";

describe("Nexus Managed Laya Runtime Provisioning & Resolution Suite", () => {
  it("resolves correct managed runtime paths in LOCALAPPDATA", () => {
    const runtimeDir = getManagedLayaRuntimeDir();
    expect(runtimeDir).toContain("LocalBridge");
    expect(runtimeDir).toContain("runtime");
    expect(runtimeDir.endsWith("laya")).toBe(true);

    const pythonPath = getManagedPythonPath();
    expect(pythonPath.startsWith(runtimeDir)).toBe(true);
    expect(pythonPath.endsWith("python.exe") || pythonPath.endsWith("python3")).toBe(true);

    const workerScript = getManagedWorkerScriptPath();
    expect(workerScript.startsWith(runtimeDir)).toBe(true);
    expect(workerScript.endsWith("laya_worker.py")).toBe(true);
  });

  it("ensures managed runtime directory and worker script are synchronized", () => {
    const ok = ensureManagedRuntime();
    expect(typeof ok).toBe("boolean");

    const runtimeDir = getManagedLayaRuntimeDir();
    expect(fs.existsSync(runtimeDir)).toBe(true);

    const workerScript = getManagedWorkerScriptPath();
    expect(fs.existsSync(workerScript)).toBe(true);
  });

  it("identifies managed runtime availability", () => {
    const available = isManagedRuntimeAvailable();
    const pythonPath = getManagedPythonPath();
    expect(available).toBe(fs.existsSync(pythonPath));
  });

  it("resolves default environment to managed runtime when available", () => {
    const env = resolveLayaExecutionEnvironment();
    if (isManagedRuntimeAvailable()) {
      expect(env.runtimeType).toBe("managed");
      expect(env.pythonPath).toBe(getManagedPythonPath());
    } else {
      expect(["managed", "system"]).toContain(env.runtimeType);
    }
  });

  it("supports developer runtime override with custom python path", () => {
    const managedPython = getManagedPythonPath();
    if (!fs.existsSync(managedPython)) {
      return;
    }

    const env = resolveLayaExecutionEnvironment({
      developerOverride: true,
      customPythonPath: managedPython,
    });

    expect(env.runtimeType).toBe("developer-override");
    expect(env.pythonPath).toBe(managedPython);
  });

  it("ignores developer override if custom path does not exist", () => {
    const env = resolveLayaExecutionEnvironment({
      developerOverride: true,
      customPythonPath: "C:\\non_existent_dir_xyz_123\\python.exe",
    });

    // Should not select the non-existent python
    expect(env.pythonPath).not.toBe("C:\\non_existent_dir_xyz_123\\python.exe");
  });
});
