import child_process from "node:child_process";

/**
 * Kill a process and its entire child process tree.
 * On Windows, uses taskkill.exe /PID <pid> /T /F.
 * On POSIX, uses process group or process SIGKILL.
 */
export async function killProcessTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      try {
        const proc = child_process.spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
          shell: false,
        });
        proc.on("close", () => resolve());
        proc.on("error", () => resolve());
      } catch {
        resolve();
      }
    });
  } else {
    try {
      // Try negative pid for process group first
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Process might already be dead
      }
    }
  }
}
