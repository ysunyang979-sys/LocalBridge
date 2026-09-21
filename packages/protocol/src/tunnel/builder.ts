import { LocalBridgeError, LocalBridgeErrorCode } from "../errors.js";
import type { TunnelEnvironmentConfig } from "./types.js";

export class TunnelEnvironmentBuilder {
  /**
   * Redacts user credentials from proxy URLs in logs or diagnostics.
   * e.g. http://user:pass@127.0.0.1:10808 -> http://user:[REDACTED]@127.0.0.1:10808
   */
  public static redactProxyUrl(url: string | null | undefined): string {
    if (!url) return "";
    return url.replace(/^(https?:\/\/)([^:@/]+):([^@/]+)@/i, "$1$2:[REDACTED]@");
  }

  /**
   * Checks if a proxy string contains embedded credentials.
   */
  public static hasCredentials(url: string): boolean {
    try {
      const normalized = url.includes("://") ? url : `http://${url}`;
      const parsed = new URL(normalized);
      return Boolean(parsed.username || parsed.password);
    } catch {
      return /:\/\/([^:@/]+):([^@/]+)@/.test(url);
    }
  }

  /**
   * Validates and normalizes custom proxy URLs.
   * Enforces no credentials and valid host:port format.
   */
  public static normalizeCustomProxy(proxyStr: string): string {
    const target = proxyStr.trim();
    if (!target) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.TUNNEL_PROXY_INVALID,
        "Custom proxy URL cannot be empty."
      );
    }

    if (this.hasCredentials(target)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROXY_CREDENTIALS_UNSUPPORTED,
        "Proxy authentication credentials are not supported in this version. Please use an unauthenticated HTTP proxy."
      );
    }

    const withProto =
      !target.startsWith("http://") && !target.startsWith("https://")
        ? `http://${target}`
        : target;

    try {
      const parsed = new URL(withProto);
      if (!parsed.hostname || !parsed.port) {
        if (!parsed.port) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.TUNNEL_PROXY_INVALID,
            `Proxy URL must include an explicit port (e.g. http://127.0.0.1:10808). Received: ${target}`
          );
        }
      }
      return `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
    } catch (e) {
      if (e instanceof LocalBridgeError) throw e;
      throw new LocalBridgeError(
        LocalBridgeErrorCode.TUNNEL_PROXY_INVALID,
        `Invalid proxy URL format: ${proxyStr}`
      );
    }
  }

  /**
   * Builds clean environment variables for tunnel-client.
   * Only CONTROL_PLANE_HTTP_PROXY is injected when proxy is active.
   * NO_PROXY is strictly set to 127.0.0.1,localhost,::1.
   * TUNNEL_CLIENT_HTTP_PROXY / HTTP_PROXY / HTTPS_PROXY are never set.
   */
  public static build(config: TunnelEnvironmentConfig): Record<string, string> {
    const env: Record<string, string> = {
      NO_PROXY: "127.0.0.1,localhost,::1",
    };

    switch (config.networkMode) {
      case "direct": {
        // Direct mode: no proxy variables
        return env;
      }

      case "system": {
        if (!config.systemProxy || config.systemProxy.trim().length === 0) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.TUNNEL_PROXY_UNREACHABLE,
            "System proxy mode selected but no valid system proxy was detected."
          );
        }
        env.CONTROL_PLANE_HTTP_PROXY = config.systemProxy.trim();
        return env;
      }

      case "custom": {
        if (!config.customProxy || config.customProxy.trim().length === 0) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.TUNNEL_PROXY_INVALID,
            "Custom proxy mode selected but no proxy URL was provided."
          );
        }
        const normalized = this.normalizeCustomProxy(config.customProxy);
        env.CONTROL_PLANE_HTTP_PROXY = normalized;
        return env;
      }

      default: {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.TUNNEL_NETWORK_MODE_INVALID,
          `Unsupported tunnel network mode: ${config.networkMode}`
        );
      }
    }
  }
}

export function redactProxyUrl(url: string | null | undefined): string {
  return TunnelEnvironmentBuilder.redactProxyUrl(url);
}
