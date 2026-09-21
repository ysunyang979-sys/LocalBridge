import { describe, it, expect } from "vitest";

describe("Shutdown Child Process Cleanup Suite (shutdown-child-cleanup.test)", () => {
  it("tracks and terminates child processes without leaving orphans", () => {
    interface TrackedProcess {
      pid: number;
      name: string;
      killed: boolean;
      kill: () => void;
    }

    const childProcesses: TrackedProcess[] = [
      { pid: 101, name: "server", killed: false, kill() { this.killed = true; } },
      { pid: 102, name: "runner", killed: false, kill() { this.killed = true; } },
      { pid: 103, name: "tunnel", killed: false, kill() { this.killed = true; } },
    ];

    function cleanAllProcesses(procs: TrackedProcess[]) {
      for (const proc of procs) {
        proc.kill();
      }
    }

    cleanAllProcesses(childProcesses);
    expect(childProcesses.every((p) => p.killed)).toBe(true);
  });
});
