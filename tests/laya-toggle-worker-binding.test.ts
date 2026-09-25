import { describe, it, expect, afterEach } from "vitest";
import {
  ManagedDecisionProvider,
  resolveDefaultModelPath,
  resolveDefaultPythonPath,
} from "../packages/security/src/intelligence/provider.js";
import { validateModelDir } from "../packages/security/src/intelligence/downloader.js";

const canRunRealLaya = validateModelDir(resolveDefaultModelPath()).valid;

describe("Laya Toggle Worker Binding & Lifecycle Suite", () => {
  let provider: ManagedDecisionProvider | null = null;

  afterEach(async () => {
    if (provider) {
      await provider.shutdown();
      provider = null;
    }
  });

  it("starts in disabled mode by default with DisabledDecisionProvider", () => {
    provider = new ManagedDecisionProvider({ provider: "disabled" });
    const status = provider.getStatus();

    expect(status.provider).toBe("disabled");
    expect(status.status).toBe("disabled");
    expect(status.workerStatus).toBe("stopped");
    expect(status.modelLoaded).toBe(false);
    expect(status.inferenceReady).toBe(false);
    expect(status.providerClass).toBe("DisabledDecisionProvider");
  });

  it.skipIf(!canRunRealLaya)("dynamically binds and starts Laya worker when toggled ON", async () => {
    provider = new ManagedDecisionProvider({
      provider: "disabled",
      modelPath: resolveDefaultModelPath(),
      pythonPath: resolveDefaultPythonPath(),
      startupTimeoutMs: 60000,
    });

    // Toggle ON to "laya"
    const newStatus = await provider.updateConfig({ provider: "laya" });

    expect(newStatus.provider).toBe("laya");
    expect(newStatus.workerStatus).toBe("running");
    expect(newStatus.modelLoaded).toBe(true);
    expect(newStatus.inferenceReady).toBe(true);
    expect(newStatus.providerClass).toBe("LayaDecisionProvider");
  }, 65000);

  it.skipIf(!canRunRealLaya)("dynamically shuts down worker and switches to DisabledDecisionProvider when toggled OFF", async () => {
    provider = new ManagedDecisionProvider({
      provider: "laya",
      modelPath: resolveDefaultModelPath(),
      pythonPath: resolveDefaultPythonPath(),
      startupTimeoutMs: 35000,
    });

    // Wait for worker to be ready
    const statusOn = provider.getStatus();
    expect(statusOn.provider).toBe("laya");

    // Toggle OFF to "disabled"
    const statusOff = await provider.updateConfig({ provider: "disabled" });

    expect(statusOff.provider).toBe("disabled");
    expect(statusOff.workerStatus).toBe("stopped");
    expect(statusOff.modelLoaded).toBe(false);
    expect(statusOff.inferenceReady).toBe(false);
    expect(statusOff.providerClass).toBe("DisabledDecisionProvider");
  }, 40000);

  it("automatically rolls back to disabled mode if worker fails to start or model is invalid", async () => {
    provider = new ManagedDecisionProvider({
      provider: "disabled",
      modelPath: "C:\\non_existent_model_dir_xyz_123",
      pythonPath: resolveDefaultPythonPath(),
    });

    // Attempting to turn ON with invalid model should throw and keep provider disabled
    await expect(provider.updateConfig({ provider: "laya" })).rejects.toThrow();

    const statusAfter = provider.getStatus();
    expect(statusAfter.provider).toBe("disabled");
    expect(statusAfter.workerStatus).toBe("stopped");
    expect(statusAfter.providerClass).toBe("DisabledDecisionProvider");
  });
});
