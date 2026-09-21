import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  sanitizeLayaExecutionEnv,
  getManagedPythonPath,
  isManagedRuntimeAvailable,
} from "../packages/security/src/intelligence/runtime.js";

describe("Laya No-Conda Runtime Isolation Suite", () => {
  it("sanitizes environment by completely stripping Conda-related variables", () => {
    const dirtyEnv = {
      PATH: "C:\\Windows\\system32;C:\\Windows",
      CONDA_PREFIX: "C:\\miniconda3\\envs\\nexus-laya",
      CONDA_DEFAULT_ENV: "nexus-laya",
      CONDA_PROMPT_MODIFIER: "(nexus-laya) ",
      _CE_M: "",
      _CE_CONDA: "",
      FOO: "BAR",
    };

    const cleanEnv = sanitizeLayaExecutionEnv(dirtyEnv);

    expect(cleanEnv.CONDA_PREFIX).toBeUndefined();
    expect(cleanEnv.CONDA_DEFAULT_ENV).toBeUndefined();
    expect(cleanEnv.CONDA_PROMPT_MODIFIER).toBeUndefined();
    expect(cleanEnv._CE_M).toBeUndefined();
    expect(cleanEnv._CE_CONDA).toBeUndefined();
    expect(cleanEnv.FOO).toBe("BAR");
    expect(cleanEnv.PYTHONUNBUFFERED).toBe("1");
  });

  it("managed python executes directly under isolated environment without Conda in PATH", () => {
    if (!isManagedRuntimeAvailable()) {
      return;
    }

    const pythonPath = getManagedPythonPath();
    const isolatedEnv = sanitizeLayaExecutionEnv({
      SystemRoot: process.env.SystemRoot || "C:\\Windows",
      PATH: "C:\\Windows\\System32;C:\\Windows",
    });

    const output = execFileSync(
      pythonPath,
      ["-c", "import sys; print('PYTHON_ISOLATION_OK')"],
      {
        env: isolatedEnv,
        encoding: "utf-8",
        timeout: 10000,
      }
    );

    expect(output).toContain("PYTHON_ISOLATION_OK");
  });

  it("imports torch and laya modules without Conda activation", () => {
    if (!isManagedRuntimeAvailable()) {
      return;
    }

    const pythonPath = getManagedPythonPath();
    const isolatedEnv = sanitizeLayaExecutionEnv({
      SystemRoot: process.env.SystemRoot || "C:\\Windows",
      PATH: "C:\\Windows\\System32;C:\\Windows",
    });

    const script = `
import torch
import laya
print(f"TORCH_VERSION={torch.__version__}")
print(f"LAYA_VERSION={laya.__version__}")
`;

    const output = execFileSync(pythonPath, ["-c", script], {
      env: isolatedEnv,
      encoding: "utf-8",
      timeout: 15000,
    });

    expect(output).toContain("TORCH_VERSION=");
    expect(output).toContain("LAYA_VERSION=");
  });
});
