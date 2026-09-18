import type { RunnerCapabilities, RunnerTools } from "@localbridge/protocol";

export function detectCapabilities(tools: RunnerTools): RunnerCapabilities {
  return {
    filesystem: true,
    shell: true,
    git: typeof tools.git === "string" && tools.git.length > 0,
    build: true,
    test: true,
    docker: typeof tools.docker === "string" && tools.docker.length > 0,
  };
}
