import fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

export function getManagedLayaRuntimeDir(): string {
  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, "AppData", "Local")
      : process.platform === "win32"
      ? "C:\\Users\\Default\\AppData\\Local"
      : path.join(process.env.HOME || "/tmp", ".localbridge"));
  return path.join(localAppData, "LocalBridge", "runtime", "laya");
}

export function getManagedPythonPath(): string {
  const runtimeDir = getManagedLayaRuntimeDir();
  return path.join(runtimeDir, process.platform === "win32" ? "python.exe" : "bin/python3");
}

export function getManagedWorkerScriptPath(): string {
  const runtimeDir = getManagedLayaRuntimeDir();
  return path.join(runtimeDir, "laya_worker.py");
}

export function isManagedRuntimeAvailable(): boolean {
  try {
    const pythonPath = getManagedPythonPath();
    return fs.existsSync(pythonPath);
  } catch {
    return false;
  }
}

export function ensureManagedRuntime(): boolean {
  const runtimeDir = getManagedLayaRuntimeDir();
  const pythonPath = getManagedPythonPath();
  const workerScriptPath = getManagedWorkerScriptPath();

  try {
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }

    // 1. If python executable is missing, check if dev conda env exists and link it
    if (!fs.existsSync(pythonPath)) {
      const devConda = path.resolve("E:/Tools/Anado/Anaa/envs/nexus-laya");
      if (fs.existsSync(devConda)) {
        try {
          if (process.platform === "win32") {
            // Remove empty dir before junction creation if it's empty
            const files = fs.readdirSync(runtimeDir);
            if (files.length === 0) {
              fs.rmdirSync(runtimeDir);
              execSync(`cmd /c mklink /J "${runtimeDir}" "${devConda}"`, { stdio: "ignore" });
            }
          }
        } catch {
          // Ignore junction error and fallback
        }
      }
    }

    // 2. Ensure worker script is present in the managed directory
    const candidateWorkerScripts = [
      path.resolve(process.cwd(), "scripts", "laya_worker.py"),
      path.resolve(__dirname, "../../scripts/laya_worker.py"),
      path.resolve(__dirname, "../scripts/laya_worker.py"),
      process.env.LOCALBRIDGE_RESOURCES_PATH
        ? path.join(process.env.LOCALBRIDGE_RESOURCES_PATH, "laya", "laya_worker.py")
        : "",
    ].filter(Boolean);

    let foundScript = candidateWorkerScripts.find((s) => fs.existsSync(s));
    if (foundScript) {
      try {
        fs.copyFileSync(foundScript, workerScriptPath);
      } catch {}
    }

    return fs.existsSync(pythonPath);
  } catch {
    return false;
  }
}

export interface ResolvedLayaEnvironment {
  pythonPath: string;
  workerScript: string;
  runtimeType: "managed" | "developer-override" | "system";
}

export function resolveLayaExecutionEnvironment(options?: {
  developerOverride?: boolean;
  customPythonPath?: string;
}): ResolvedLayaEnvironment {
  // 1. Developer Override
  if (
    options?.developerOverride &&
    options.customPythonPath &&
    fs.existsSync(options.customPythonPath)
  ) {
    const candidateWorker = [
      getManagedWorkerScriptPath(),
      path.resolve(process.cwd(), "scripts", "laya_worker.py"),
    ].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "scripts", "laya_worker.py");

    return {
      pythonPath: options.customPythonPath,
      workerScript: candidateWorker,
      runtimeType: "developer-override",
    };
  }

  // 2. Explicit Environment Variable Override
  if (
    process.env.LOCALBRIDGE_LAYA_PYTHON_PATH &&
    fs.existsSync(process.env.LOCALBRIDGE_LAYA_PYTHON_PATH)
  ) {
    const candidateWorker = [
      getManagedWorkerScriptPath(),
      path.resolve(process.cwd(), "scripts", "laya_worker.py"),
    ].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "scripts", "laya_worker.py");

    return {
      pythonPath: process.env.LOCALBRIDGE_LAYA_PYTHON_PATH,
      workerScript: candidateWorker,
      runtimeType: "developer-override",
    };
  }

  // 3. Managed Nexus Runtime
  ensureManagedRuntime();
  if (isManagedRuntimeAvailable()) {
    const managedWorker = getManagedWorkerScriptPath();
    const workerScript = fs.existsSync(managedWorker)
      ? managedWorker
      : path.resolve(process.cwd(), "scripts", "laya_worker.py");

    return {
      pythonPath: getManagedPythonPath(),
      workerScript,
      runtimeType: "managed",
    };
  }

  // 4. Bundled Resource Runtime
  if (process.env.LOCALBRIDGE_RESOURCES_PATH) {
    const bundledPython = path.join(
      process.env.LOCALBRIDGE_RESOURCES_PATH,
      "runtime",
      "laya",
      process.platform === "win32" ? "python.exe" : "bin/python3"
    );
    if (fs.existsSync(bundledPython)) {
      const bundledWorker = path.join(
        process.env.LOCALBRIDGE_RESOURCES_PATH,
        "laya",
        "laya_worker.py"
      );
      return {
        pythonPath: bundledPython,
        workerScript: fs.existsSync(bundledWorker)
          ? bundledWorker
          : path.resolve(process.cwd(), "scripts", "laya_worker.py"),
        runtimeType: "managed",
      };
    }
  }

  // 5. System Python Fallback
  return {
    pythonPath: "python",
    workerScript: path.resolve(process.cwd(), "scripts", "laya_worker.py"),
    runtimeType: "system",
  };
}

export function sanitizeLayaExecutionEnv(baseEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined) continue;
    // Strip Conda-specific environment variables so the worker runs purely self-contained
    if (
      key === "CONDA_PREFIX" ||
      key === "CONDA_DEFAULT_ENV" ||
      key === "CONDA_PROMPT_MODIFIER" ||
      key === "_CE_M" ||
      key === "_CE_CONDA"
    ) {
      continue;
    }
    env[key] = value;
  }
  env.PYTHONUNBUFFERED = "1";
  return env;
}
