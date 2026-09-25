import child_process from "node:child_process";

export interface DiscoveredPort {
  port: number;
  protocol: "TCP" | "UDP";
  address: string;
  state: string;
  pid: number | null;
}

export class PortInspector {
  static async listPorts(): Promise<DiscoveredPort[]> {
    if (process.platform === "win32") {
      return this.listWindowsPorts();
    } else {
      return this.listPosixPorts();
    }
  }

  private static async listWindowsPorts(): Promise<DiscoveredPort[]> {
    return new Promise((resolve) => {
      const proc = child_process.spawn("netstat.exe", ["-ano"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });

      proc.on("close", () => {
        if (!stdout.trim()) {
          resolve([]);
          return;
        }

        const lines = stdout.split(/\r?\n/);
        const results: DiscoveredPort[] = [];
        const seen = new Set<string>();

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 4 || !parts[0] || !parts[1] || !parts[3]) continue;

          const proto = parts[0].toUpperCase();
          if (proto !== "TCP" && proto !== "UDP") continue;

          const localAddr = parts[1];
          let state = proto === "TCP" ? parts[3] : "LISTENING";
          let pidStr = proto === "TCP" ? (parts[4] ?? parts[3]) : parts[3];

          // For UDP lines: UDP 0.0.0.0:1234 *:* 5678
          if (proto === "UDP") {
            state = "LISTENING";
            pidStr = parts[parts.length - 1] ?? parts[3];
          }

          const pid = Number(pidStr);

          // Parse port from local address: e.g. 0.0.0.0:3000, [::]:3000, 127.0.0.1:8080
          const colonIdx = localAddr.lastIndexOf(":");
          if (colonIdx === -1) continue;

          const portNum = Number(localAddr.slice(colonIdx + 1));
          if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) continue;

          const address = localAddr.slice(0, colonIdx);
          const key = `${proto}:${portNum}:${pid}`;
          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            port: portNum,
            protocol: proto as "TCP" | "UDP",
            address: address || "0.0.0.0",
            state: state || "UNKNOWN",
            pid: Number.isInteger(pid) && pid > 0 ? pid : null,
          });
        }

        resolve(results);
      });

      proc.on("error", () => resolve([]));
    });
  }

  private static async listPosixPorts(): Promise<DiscoveredPort[]> {
    return new Promise((resolve) => {
      const proc = child_process.spawn("ss", ["-tulpn"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });

      proc.on("close", (code) => {
        if (code !== 0 || !stdout.trim()) {
          resolve([]);
          return;
        }

        const lines = stdout.split("\n").slice(1);
        const results: DiscoveredPort[] = [];

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 5 || !parts[0] || !parts[1] || !parts[4]) continue;

          const proto = parts[0].toUpperCase().startsWith("TCP") ? "TCP" : "UDP";
          const state = parts[1];
          const local = parts[4];
          const colonIdx = local.lastIndexOf(":");
          if (colonIdx === -1) continue;

          const port = Number(local.slice(colonIdx + 1));
          if (!Number.isInteger(port) || port <= 0) continue;

          // Process field in ss -tulpn format: users:(("node",pid=1234,fd=18))
          let pid: number | null = null;
          const pidMatch = /pid=(\d+)/.exec(line);
          if (pidMatch && pidMatch[1]) {
            pid = Number(pidMatch[1]);
          }

          results.push({
            port,
            protocol: proto as "TCP" | "UDP",
            address: local.slice(0, colonIdx),
            state: state || "LISTENING",
            pid,
          });
        }

        resolve(results);
      });

      proc.on("error", () => resolve([]));
    });
  }
}
