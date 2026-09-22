import childProcess from "node:child_process";
import type { SystemProxyInfo } from "./types.js";

export class WindowsSystemProxyResolver {
  private queryRunner: () => string;

  constructor(customQueryRunner?: () => string) {
    this.queryRunner =
      customQueryRunner ??
      (() => {
        if (typeof process === "undefined" || process.platform !== "win32") {
          return "";
        }
        try {
          return childProcess.execSync(
            'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"',
            {
              encoding: "utf-8",
              stdio: ["ignore", "pipe", "ignore"],
            }
          );
        } catch {
          return "";
        }
      });
  }

  public resolve(): SystemProxyInfo {
    const raw = this.queryRunner();
    if (!raw || raw.trim().length === 0) {
      return {
        enabled: false,
        source: "none",
        supported: true,
      };
    }

    let proxyEnable = 0;
    let proxyServer: string | undefined;
    let autoConfigUrl: string | undefined;

    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      const matchEnable = trimmed.match(
        /^ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/i
      );
      if (matchEnable && matchEnable[1]) {
        const valStr = matchEnable[1];
        proxyEnable = valStr.startsWith("0x")
          ? parseInt(valStr, 16)
          : parseInt(valStr, 10);
        continue;
      }
      const matchServer = trimmed.match(/^ProxyServer\s+REG_SZ\s+(.+)$/i);
      if (matchServer && matchServer[1]) {
        proxyServer = matchServer[1].trim();
        continue;
      }
      const matchPac = trimmed.match(/^AutoConfigURL\s+REG_SZ\s+(.+)$/i);
      if (matchPac && matchPac[1]) {
        autoConfigUrl = matchPac[1].trim();
        continue;
      }
    }

    // PAC proxy detected without explicit proxy server or with proxy disabled
    if (autoConfigUrl && (!proxyServer || proxyEnable === 0)) {
      return {
        enabled: true,
        source: "system",
        pacUrl: autoConfigUrl,
        supported: false,
        error: "PAC proxy detected but unsupported",
      };
    }

    if (proxyEnable === 1 && proxyServer) {
      const normalized = this.normalizeProxyServer(proxyServer);
      if (!normalized) {
        return {
          enabled: true,
          source: "system",
          supported: false,
          error: "Invalid system proxy server address",
        };
      }
      return {
        enabled: true,
        proxyUrl: normalized,
        source: "system",
        supported: true,
      };
    }

    return {
      enabled: false,
      source: "system",
      supported: true,
    };
  }

  public normalizeProxyServer(serverStr: string): string | null {
    let target = serverStr.trim();
    if (!target) return null;

    // Handle semicolon separated protocols e.g. "http=127.0.0.1:8080;https=127.0.0.1:10808"
    if (target.includes(";")) {
      const parts = target.split(";");
      let httpsPart: string | undefined;
      let httpPart: string | undefined;
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith("https=")) {
          httpsPart = trimmed.substring(6).trim();
        } else if (trimmed.startsWith("http=")) {
          httpPart = trimmed.substring(5).trim();
        }
      }
      target = httpsPart || httpPart || (parts[0] ? parts[0].trim() : "");
    }

    if (target.startsWith("https=")) {
      target = target.substring(6).trim();
    } else if (target.startsWith("http=")) {
      target = target.substring(5).trim();
    }

    if (!target) return null;

    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `http://${target}`;
    }

    try {
      const parsed = new URL(target);
      if (!parsed.hostname) return null;
      const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
      return `${parsed.protocol}//${parsed.hostname}:${port}`;
    } catch {
      return null;
    }
  }
}
