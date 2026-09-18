import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../projects/index.js";

function getDefaultStoragePath(): string {
  return (
    process.env.LOCALBRIDGE_PROJECTS_PATH ||
    path.join(os.homedir(), ".localbridge", "projects.json")
  );
}

export function runProjectCli(argv: string[]): void {
  const args = [...argv];
  let storagePath = getDefaultStoragePath();

  // Extract optional --projects-path
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--projects-path") {
      storagePath = args[i + 1] || storagePath;
      args.splice(i, 2);
      i--;
    } else if (args[i]?.startsWith("--projects-path=")) {
      storagePath = args[i]!.split("=")[1] || storagePath;
      args.splice(i, 1);
      i--;
    }
  }

  const command = args[0];
  const registry = new ProjectRegistry(storagePath);

  switch (command) {
    case "add": {
      const projectPath = args[1];
      if (!projectPath) {
        console.error("Error: Project path is required. Usage: project:add <path> [--name <name>]");
        process.exit(1);
      }

      let name: string | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === "--name" && args[i + 1]) {
          name = args[i + 1];
          break;
        } else if (args[i]?.startsWith("--name=")) {
          name = args[i]!.split("=")[1];
          break;
        }
      }

      try {
        const record = registry.add(projectPath, { name });
        console.log("Project authorized successfully.\n");
        console.log(`ID:     ${record.id}`);
        console.log(`Name:   ${record.name}`);
        console.log(`Root:   ${record.root}`);
        console.log(`Status: ${record.enabled ? "Enabled" : "Disabled"}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to authorize project: ${msg}`);
        process.exit(1);
      }
      break;
    }

    case "list": {
      const projects = registry.list();
      if (projects.length === 0) {
        console.log("No authorized projects registered.");
        return;
      }

      console.log(`Authorized Projects (${projects.length}):\n`);
      for (const p of projects) {
        console.log(`- ID:     ${p.id}`);
        console.log(`  Name:   ${p.name}`);
        console.log(`  Root:   ${p.root}`);
        console.log(`  Status: ${p.enabled ? "Enabled" : "Disabled"}\n`);
      }
      break;
    }

    case "remove": {
      const id = args[1];
      if (!id) {
        console.error("Error: Project ID is required. Usage: project:remove <id>");
        process.exit(1);
      }

      const success = registry.remove(id);
      if (success) {
        console.log(`Project "${id}" removed successfully.`);
      } else {
        console.error(`Project "${id}" not found.`);
        process.exit(1);
      }
      break;
    }

    case "enable": {
      const id = args[1];
      if (!id) {
        console.error("Error: Project ID is required. Usage: project:enable <id>");
        process.exit(1);
      }

      const success = registry.enable(id);
      if (success) {
        console.log(`Project "${id}" enabled.`);
      } else {
        console.error(`Project "${id}" not found.`);
        process.exit(1);
      }
      break;
    }

    case "disable": {
      const id = args[1];
      if (!id) {
        console.error("Error: Project ID is required. Usage: project:disable <id>");
        process.exit(1);
      }

      const success = registry.disable(id);
      if (success) {
        console.log(`Project "${id}" disabled.`);
      } else {
        console.error(`Project "${id}" not found.`);
        process.exit(1);
      }
      break;
    }

    case "set-access": {
      const id = args[1];
      const mode = args[2];
      if (!id || !mode) {
        console.error("Error: Project ID and access mode are required. Usage: project:set-access <id> <read-only|read-write>");
        process.exit(1);
      }

      if (mode !== "read-only" && mode !== "read-write") {
        console.error("Error: Invalid access mode. Must be 'read-only' or 'read-write'.");
        process.exit(1);
      }

      const existing = registry.get(id);
      if (!existing) {
        console.error(`Project "${id}" not found.`);
        process.exit(1);
      }

      const prevMode = existing.accessMode ?? "read-only";
      registry.setAccessMode(id, mode);

      console.log(`Project:\n${existing.name}\n`);
      console.log(`Previous:\n${prevMode}\n`);
      console.log(`New:\n${mode}`);
      break;
    }

    default:
      console.log("LocalBridge Project Management CLI\n");
      console.log("Commands:");
      console.log("  add <path> [--name <name>]          Authorize a new local project directory");
      console.log("  list                                List all authorized projects");
      console.log("  remove <id>                         Remove an authorized project");
      console.log("  enable <id>                         Enable an authorized project");
      console.log("  disable <id>                        Disable an authorized project");
      console.log("  set-access <id> <read-only|read-write> Set project access mode");
      break;
  }
}

// Execute directly if run via CLI
if (process.argv[1]?.includes("project-cli")) {
  runProjectCli(process.argv.slice(2));
}
