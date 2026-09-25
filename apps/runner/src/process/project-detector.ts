import fs from "node:fs";
import path from "node:path";
import type {
  ProjectDetectParams,
  ProjectDetectResult,
  RecommendedCommand,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../projects/index.js";
import type { WorkspaceResolver } from "../worktree/resolver.js";
import { resolveProjectPath } from "@localbridge/security";

export class ProjectDetectionService {
  private workspaceResolver?: WorkspaceResolver;

  constructor(private readonly projectRegistry: ProjectRegistry) {}

  setWorkspaceResolver(resolver: WorkspaceResolver): void {
    this.workspaceResolver = resolver;
  }

  async detect(params: ProjectDetectParams): Promise<ProjectDetectResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const workspace = this.workspaceResolver?.resolve(params.projectId);
    const effectiveRoot = workspace?.workspaceRoot ?? project.canonicalRoot;

    let targetDir = effectiveRoot;
    if (params.relativeCwd && params.relativeCwd.trim() !== "" && params.relativeCwd !== ".") {
      const resolved = resolveProjectPath(effectiveRoot, params.relativeCwd, {
        mustExist: true,
        allowSensitive: false,
      });
      targetDir = resolved.canonicalPath;
    }

    const detectedTypes: string[] = [];
    const detectedRuntimes = new Set<string>();
    const configFiles: string[] = [];
    const recommendedCommands: RecommendedCommand[] = [];
    let scripts: Record<string, string> | undefined;

    // 1. Node.js / JavaScript / TypeScript
    const packageJsonPath = path.join(targetDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      configFiles.push("package.json");
      detectedTypes.push("node");
      detectedRuntimes.add("node");

      // Check package manager
      let pkgManager = "npm";
      if (fs.existsSync(path.join(targetDir, "pnpm-lock.yaml"))) {
        pkgManager = "pnpm";
        configFiles.push("pnpm-lock.yaml");
        detectedRuntimes.add("pnpm");
      } else if (fs.existsSync(path.join(targetDir, "yarn.lock"))) {
        pkgManager = "yarn";
        configFiles.push("yarn.lock");
        detectedRuntimes.add("yarn");
      } else if (fs.existsSync(path.join(targetDir, "bun.lockb")) || fs.existsSync(path.join(targetDir, "bun.lock"))) {
        pkgManager = "bun";
        configFiles.push("bun.lock");
        detectedRuntimes.add("bun");
      } else {
        if (fs.existsSync(path.join(targetDir, "package-lock.json"))) {
          configFiles.push("package-lock.json");
        }
        detectedRuntimes.add("npm");
      }

      try {
        const pkgContent = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        if (pkgContent.scripts && typeof pkgContent.scripts === "object") {
          scripts = {};
          for (const [k, v] of Object.entries(pkgContent.scripts)) {
            if (typeof v === "string") scripts[k] = v;
          }

          if (scripts.test) {
            recommendedCommands.push({
              name: "Test",
              command: pkgManager,
              args: ["test"],
              category: "test",
              description: `Run tests via ${pkgManager} test (${scripts.test})`,
            });
          }
          if (scripts.build) {
            recommendedCommands.push({
              name: "Build",
              command: pkgManager,
              args: ["run", "build"],
              category: "build",
              description: `Build project via ${pkgManager} run build (${scripts.build})`,
            });
          }
          if (scripts.lint) {
            recommendedCommands.push({
              name: "Lint",
              command: pkgManager,
              args: ["run", "lint"],
              category: "lint",
              description: `Lint source via ${pkgManager} run lint (${scripts.lint})`,
            });
          }
          if (scripts.typecheck || scripts.check) {
            const scriptName = scripts.typecheck ? "typecheck" : "check";
            recommendedCommands.push({
              name: "Typecheck",
              command: pkgManager,
              args: ["run", scriptName],
              category: "typecheck",
              description: `Typecheck source via ${pkgManager} run ${scriptName}`,
            });
          }
          if (scripts.dev || scripts.start) {
            const scriptName = scripts.dev ? "dev" : "start";
            recommendedCommands.push({
              name: "Dev Server",
              command: pkgManager,
              args: ["run", scriptName],
              category: "dev-server",
              description: `Start development server via ${pkgManager} run ${scriptName}`,
            });
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    // 2. Rust
    const cargoTomlPath = path.join(targetDir, "Cargo.toml");
    if (fs.existsSync(cargoTomlPath)) {
      configFiles.push("Cargo.toml");
      if (fs.existsSync(path.join(targetDir, "Cargo.lock"))) {
        configFiles.push("Cargo.lock");
      }
      detectedTypes.push("rust");
      detectedRuntimes.add("rustc");
      detectedRuntimes.add("cargo");

      recommendedCommands.push(
        {
          name: "Cargo Check",
          command: "cargo",
          args: ["check"],
          category: "typecheck",
          description: "Analyze the current package and report compiler errors without producing binaries",
        },
        {
          name: "Cargo Build",
          command: "cargo",
          args: ["build"],
          category: "build",
          description: "Compile the local package and all dependencies",
        },
        {
          name: "Cargo Test",
          command: "cargo",
          args: ["test"],
          category: "test",
          description: "Execute all unit and integration tests",
        },
        {
          name: "Cargo Clippy",
          command: "cargo",
          args: ["clippy"],
          category: "lint",
          description: "Run Clippy linter checks",
        }
      );
    }

    // 3. Go
    const goModPath = path.join(targetDir, "go.mod");
    if (fs.existsSync(goModPath)) {
      configFiles.push("go.mod");
      if (fs.existsSync(path.join(targetDir, "go.sum"))) {
        configFiles.push("go.sum");
      }
      detectedTypes.push("go");
      detectedRuntimes.add("go");

      recommendedCommands.push(
        {
          name: "Go Test",
          command: "go",
          args: ["test", "./..."],
          category: "test",
          description: "Run package tests recursively",
        },
        {
          name: "Go Build",
          command: "go",
          args: ["build", "./..."],
          category: "build",
          description: "Compile Go packages",
        },
        {
          name: "Go Vet",
          command: "go",
          args: ["vet", "./..."],
          category: "lint",
          description: "Examine Go source code and report suspicious constructs",
        }
      );
    }

    // 4. Python
    const pyConfigFiles = ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile", "Pipfile.lock", "uv.lock"];
    let isPython = false;
    for (const f of pyConfigFiles) {
      if (fs.existsSync(path.join(targetDir, f))) {
        configFiles.push(f);
        isPython = true;
      }
    }
    if (isPython) {
      detectedTypes.push("python");
      detectedRuntimes.add("python");
      detectedRuntimes.add("pip");
      if (configFiles.includes("uv.lock")) {
        detectedRuntimes.add("uv");
      }

      recommendedCommands.push(
        {
          name: "Pytest",
          command: "python",
          args: ["-m", "pytest"],
          category: "test",
          description: "Run Python test suite using pytest",
        },
        {
          name: "Python Unittest",
          command: "python",
          args: ["-m", "unittest", "discover"],
          category: "test",
          description: "Run Python test discovery using builtin unittest",
        }
      );
    }

    // 5. Java / JVM
    const pomXmlPath = path.join(targetDir, "pom.xml");
    const gradlePath = path.join(targetDir, "build.gradle");
    const gradleKtsPath = path.join(targetDir, "build.gradle.kts");
    if (fs.existsSync(pomXmlPath)) {
      configFiles.push("pom.xml");
      detectedTypes.push("java");
      detectedRuntimes.add("java");
      detectedRuntimes.add("javac");
      detectedRuntimes.add("mvn");

      recommendedCommands.push(
        {
          name: "Maven Compile",
          command: "mvn",
          args: ["compile"],
          category: "build",
          description: "Compile Java source files",
        },
        {
          name: "Maven Test",
          command: "mvn",
          args: ["test"],
          category: "test",
          description: "Run Java tests with Maven",
        },
        {
          name: "Maven Package",
          command: "mvn",
          args: ["package"],
          category: "build",
          description: "Take the compiled code and package it in its distributable format",
        }
      );
    } else if (fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath)) {
      if (fs.existsSync(gradlePath)) configFiles.push("build.gradle");
      if (fs.existsSync(gradleKtsPath)) configFiles.push("build.gradle.kts");
      detectedTypes.push("java");
      detectedRuntimes.add("java");
      detectedRuntimes.add("javac");
      detectedRuntimes.add("gradle");

      const hasWrapper = fs.existsSync(path.join(targetDir, process.platform === "win32" ? "gradlew.bat" : "gradlew"));
      const gradleCmd = hasWrapper ? (process.platform === "win32" ? "gradlew.bat" : "./gradlew") : "gradle";

      recommendedCommands.push(
        {
          name: "Gradle Build",
          command: gradleCmd,
          args: ["build"],
          category: "build",
          description: "Build project and execute check tasks using Gradle",
        },
        {
          name: "Gradle Test",
          command: gradleCmd,
          args: ["test"],
          category: "test",
          description: "Run Gradle test suite",
        }
      );
    }

    // 6. PHP
    const composerJsonPath = path.join(targetDir, "composer.json");
    if (fs.existsSync(composerJsonPath)) {
      configFiles.push("composer.json");
      if (fs.existsSync(path.join(targetDir, "composer.lock"))) {
        configFiles.push("composer.lock");
      }
      detectedTypes.push("php");
      detectedRuntimes.add("php");
      detectedRuntimes.add("composer");

      recommendedCommands.push(
        {
          name: "Composer Install",
          command: "composer",
          args: ["install"],
          category: "package-install",
          description: "Install dependencies defined in composer.json",
        },
        {
          name: "Composer Test",
          command: "composer",
          args: ["test"],
          category: "test",
          description: "Run PHP test script via Composer",
        }
      );
    }

    // 7. Ruby
    const gemfilePath = path.join(targetDir, "Gemfile");
    if (fs.existsSync(gemfilePath)) {
      configFiles.push("Gemfile");
      if (fs.existsSync(path.join(targetDir, "Gemfile.lock"))) {
        configFiles.push("Gemfile.lock");
      }
      detectedTypes.push("ruby");
      detectedRuntimes.add("ruby");
      detectedRuntimes.add("gem");

      recommendedCommands.push({
        name: "Bundle Exec Rake Test",
        command: "bundle",
        args: ["exec", "rake", "test"],
        category: "test",
        description: "Run tests via bundle exec rake test",
      });
    }

    // 8. .NET
    try {
      const files = fs.readdirSync(targetDir);
      const hasDotnet = files.some((f) => f.endsWith(".sln") || f.endsWith(".csproj") || f.endsWith(".fsproj"));
      if (hasDotnet) {
        files.filter((f) => f.endsWith(".sln") || f.endsWith(".csproj")).forEach((f) => configFiles.push(f));
        detectedTypes.push("dotnet");
        detectedRuntimes.add("dotnet");

        recommendedCommands.push(
          {
            name: "Dotnet Build",
            command: "dotnet",
            args: ["build"],
            category: "build",
            description: "Build a .NET project and all of its dependencies",
          },
          {
            name: "Dotnet Test",
            command: "dotnet",
            args: ["test"],
            category: "test",
            description: ".NET test execution driver",
          }
        );
      }
    } catch {
      // Ignore readdir error
    }

    // 9. C/C++
    const cmakePath = path.join(targetDir, "CMakeLists.txt");
    const makefilePath = path.join(targetDir, "Makefile");
    if (fs.existsSync(cmakePath)) {
      configFiles.push("CMakeLists.txt");
      detectedTypes.push("cpp");
      detectedRuntimes.add("cmake");

      recommendedCommands.push(
        {
          name: "CMake Configure",
          command: "cmake",
          args: ["-B", "build"],
          category: "build",
          description: "Configure build tree using CMake",
        },
        {
          name: "CMake Build",
          command: "cmake",
          args: ["--build", "build"],
          category: "build",
          description: "Build project binaries using configured build tree",
        }
      );
    } else if (fs.existsSync(makefilePath)) {
      configFiles.push("Makefile");
      detectedTypes.push("cpp");
      detectedRuntimes.add("make");

      recommendedCommands.push({
        name: "Make",
        command: "make",
        args: [],
        category: "build",
        description: "Build project using Makefile",
      });
    }

    // 10. Docker / Container
    const dockerFiles = ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
    for (const df of dockerFiles) {
      if (fs.existsSync(path.join(targetDir, df))) {
        configFiles.push(df);
        detectedRuntimes.add("docker");
      }
    }

    let finalProjectType = "unknown";
    if (detectedTypes.length === 1) {
      finalProjectType = detectedTypes[0]!;
    } else if (detectedTypes.length > 1) {
      finalProjectType = "polyglot";
    }

    return {
      projectId: params.projectId,
      projectType: finalProjectType,
      detectedRuntimes: Array.from(detectedRuntimes),
      configFiles,
      recommendedCommands,
      ...(scripts ? { scripts } : {}),
    };
  }
}
