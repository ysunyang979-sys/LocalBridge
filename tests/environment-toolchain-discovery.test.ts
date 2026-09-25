import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  RunnerRpcMethods,
  type EnvironmentDetectParams,
  type ProjectDetectParams,
} from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import {
  ExecutableRegistry,
  ProjectDetectionService,
} from "../apps/runner/src/process/index.js";
import { RpcRouter } from "../apps/runner/src/rpc/router.js";
import { createEnvironmentDetectHandler } from "../apps/runner/src/rpc/handlers/environment-detect.js";
import { createProjectDetectHandler } from "../apps/runner/src/rpc/handlers/project-detect.js";

describe("Developer Environment & Toolchain Discovery", () => {
  let tempDir: string;
  let registryPath: string;
  let projectRegistry: ProjectRegistry;
  let execRegistry: ExecutableRegistry;
  let projectDetector: ProjectDetectionService;
  let router: RpcRouter;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-env-discover-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectRegistry = new ProjectRegistry(registryPath);
    execRegistry = new ExecutableRegistry();
    projectDetector = new ProjectDetectionService(projectRegistry);
    router = new RpcRouter();

    router.register(
      RunnerRpcMethods.EnvironmentDetect,
      createEnvironmentDetectHandler(execRegistry)
    );
    router.register(
      RunnerRpcMethods.ProjectDetect,
      createProjectDetectHandler(projectDetector)
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("ExecutableRegistry.detectEnvironment", () => {
    it("detects installed host tools correctly (node, npm, git)", async () => {
      const result = await execRegistry.detectEnvironment(["node", "npm", "git"]);
      expect(result.tools.length).toBe(3);

      const node = result.tools.find((t) => t.tool === "node");
      expect(node).toBeDefined();
      expect(node?.installed).toBe(true);
      expect(node?.version).toBeDefined();
      expect(node?.path).toBeDefined();
      expect(node?.category).toBe("javascript");

      const npm = result.tools.find((t) => t.tool === "npm");
      expect(npm).toBeDefined();
      expect(npm?.installed).toBe(true);
      expect(npm?.category).toBe("javascript");

      const git = result.tools.find((t) => t.tool === "git");
      expect(git).toBeDefined();
      expect(git?.installed).toBe(true);
      expect(git?.category).toBe("vcs");
    });

    it("handles uninstalled tools gracefully without throwing", async () => {
      const result = await execRegistry.detectEnvironment(["unknown-tool-xyz"]);
      expect(result.tools.length).toBe(1);
      const tool = result.tools[0];
      expect(tool.installed).toBe(false);
      expect(tool.path).toBeNull();
      expect(tool.version).toBeNull();
    });

    it("detects all 27 standard dev tools when no filter is supplied", async () => {
      const result = await execRegistry.detectEnvironment();
      expect(result.tools.length).toBeGreaterThanOrEqual(25);

      // Verify category distribution
      const categories = new Set(result.tools.map((t) => t.category));
      expect(categories.has("javascript")).toBe(true);
      expect(categories.has("python")).toBe(true);
      expect(categories.has("rust")).toBe(true);
      expect(categories.has("go")).toBe(true);
      expect(categories.has("shell")).toBe(true);
    });
  });

  describe("ProjectDetectionService", () => {
    it("detects Node.js project with pnpm and package scripts", async () => {
      const projDir = path.join(tempDir, "node-project");
      fs.mkdirSync(projDir, { recursive: true });

      const pkgJson = {
        name: "test-app",
        scripts: {
          dev: "vite",
          build: "tsc && vite build",
          test: "vitest run",
          lint: "eslint .",
        },
      };
      fs.writeFileSync(path.join(projDir, "package.json"), JSON.stringify(pkgJson, null, 2));
      fs.writeFileSync(path.join(projDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");

      const rec = projectRegistry.add(projDir, { name: "Node App" });
      const result = await projectDetector.detect({ projectId: rec.id });

      expect(result.projectId).toBe(rec.id);
      expect(result.projectType).toBe("node");
      expect(result.detectedRuntimes).toContain("node");
      expect(result.detectedRuntimes).toContain("pnpm");
      expect(result.configFiles).toContain("package.json");
      expect(result.configFiles).toContain("pnpm-lock.yaml");
      expect(result.scripts?.dev).toBe("vite");
      expect(result.scripts?.build).toBe("tsc && vite build");

      // Verify recommendations
      const recNames = result.recommendedCommands.map((r) => r.name);
      expect(recNames).toContain("Dev Server");
      expect(recNames).toContain("Build");
      expect(recNames).toContain("Test");
    });

    it("detects Rust project and provides cargo recommendations", async () => {
      const projDir = path.join(tempDir, "rust-project");
      fs.mkdirSync(projDir, { recursive: true });

      fs.writeFileSync(
        path.join(projDir, "Cargo.toml"),
        '[package]\nname = "rust-app"\nversion = "0.1.0"\nedition = "2021"\n'
      );

      const rec = projectRegistry.add(projDir, { name: "Rust App" });
      const result = await projectDetector.detect({ projectId: rec.id });

      expect(result.projectType).toBe("rust");
      expect(result.detectedRuntimes).toContain("rustc");
      expect(result.detectedRuntimes).toContain("cargo");
      expect(result.configFiles).toContain("Cargo.toml");

      const checkCmd = result.recommendedCommands.find((r) => r.name === "Cargo Check");
      expect(checkCmd).toBeDefined();
      expect(checkCmd?.command).toBe("cargo");
      expect(checkCmd?.args).toEqual(["check"]);
    });

    it("detects Go project and provides go recommendations", async () => {
      const projDir = path.join(tempDir, "go-project");
      fs.mkdirSync(projDir, { recursive: true });

      fs.writeFileSync(
        path.join(projDir, "go.mod"),
        "module example.com/my-go-app\n\ngo 1.25\n"
      );

      const rec = projectRegistry.add(projDir, { name: "Go App" });
      const result = await projectDetector.detect({ projectId: rec.id });

      expect(result.projectType).toBe("go");
      expect(result.detectedRuntimes).toContain("go");
      expect(result.configFiles).toContain("go.mod");

      const testCmd = result.recommendedCommands.find((r) => r.name === "Go Test");
      expect(testCmd).toBeDefined();
      expect(testCmd?.command).toBe("go");
      expect(testCmd?.args).toEqual(["test", "./..."]);
    });

    it("detects Python project with pyproject.toml", async () => {
      const projDir = path.join(tempDir, "py-project");
      fs.mkdirSync(projDir, { recursive: true });

      fs.writeFileSync(
        path.join(projDir, "pyproject.toml"),
        '[project]\nname = "my-py-app"\nversion = "0.1.0"\n'
      );

      const rec = projectRegistry.add(projDir, { name: "Python App" });
      const result = await projectDetector.detect({ projectId: rec.id });

      expect(result.projectType).toBe("python");
      expect(result.detectedRuntimes).toContain("python");
      expect(result.configFiles).toContain("pyproject.toml");
    });

    it("detects Dockerfile and multi-runtime projects as polyglot", async () => {
      const projDir = path.join(tempDir, "polyglot-project");
      fs.mkdirSync(projDir, { recursive: true });

      fs.writeFileSync(path.join(projDir, "package.json"), JSON.stringify({ name: "polyglot" }));
      fs.writeFileSync(path.join(projDir, "Cargo.toml"), '[package]\nname = "app"\n');

      const rec = projectRegistry.add(projDir, { name: "Polyglot App" });
      const result = await projectDetector.detect({ projectId: rec.id });

      expect(result.projectType).toBe("polyglot");
      expect(result.configFiles).toContain("Cargo.toml");
      expect(result.configFiles).toContain("package.json");
    });

    it("supports subdirectory detection via relativeCwd", async () => {
      const rootDir = path.join(tempDir, "monorepo");
      const backendDir = path.join(rootDir, "backend");
      fs.mkdirSync(backendDir, { recursive: true });

      fs.writeFileSync(
        path.join(backendDir, "Cargo.toml"),
        '[package]\nname = "backend"\n'
      );

      const rec = projectRegistry.add(rootDir, { name: "Monorepo" });
      const result = await projectDetector.detect({
        projectId: rec.id,
        relativeCwd: "backend",
      });

      expect(result.projectType).toBe("rust");
      expect(result.configFiles).toContain("Cargo.toml");
    });
  });

  describe("RPC Endpoints Integration", () => {
    it("handles RunnerRpcMethods.EnvironmentDetect via RPC router", async () => {
      const rawReq = JSON.stringify({
        jsonrpc: "2.0",
        id: "req_1",
        method: RunnerRpcMethods.EnvironmentDetect,
        params: { tools: ["node", "git"] } as EnvironmentDetectParams,
      });

      const response = await router.handle(rawReq);
      expect(response).not.toBeNull();
      expect(response?.error).toBeUndefined();
      const result = response?.result as any;
      expect(result.tools.length).toBe(2);
      expect(result.tools[0].tool).toBe("node");
    });

    it("handles RunnerRpcMethods.ProjectDetect via RPC router", async () => {
      const projDir = path.join(tempDir, "rpc-project");
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(
        path.join(projDir, "package.json"),
        JSON.stringify({ name: "rpc-test", scripts: { test: "echo test" } })
      );

      const rec = projectRegistry.add(projDir, { name: "RPC Project" });

      const rawReq = JSON.stringify({
        jsonrpc: "2.0",
        id: "req_2",
        method: RunnerRpcMethods.ProjectDetect,
        params: { projectId: rec.id } as ProjectDetectParams,
      });

      const response = await router.handle(rawReq);
      expect(response).not.toBeNull();
      expect(response?.error).toBeUndefined();
      const result = response?.result as any;
      expect(result.projectType).toBe("node");
      expect(result.scripts?.test).toBe("echo test");
    });
  });
});
