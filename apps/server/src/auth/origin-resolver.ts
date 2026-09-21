import type { FastifyRequest } from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Resolves the genuine, canonical public HTTPS origin for OAuth discovery,
 * WWW-Authenticate challenges, and metadata endpoints.
 *
 * Guarantees that public responses never leak private or loopback addresses
 * (such as 127.0.0.1, localhost, 18080, or tauri://).
 */
export function resolvePublicOrigin(
  request: FastifyRequest,
  fallbackPublicHost?: string
): string {
  // 1. Try forwarded headers first (standard reverse proxies, Cloudflare Tunnel, local tunnel proxy)
  const forwardedHost =
    (request.headers["x-forwarded-host"] as string) ||
    (request.headers["x-original-host"] as string) ||
    (request.headers["x-forwarded-server"] as string);

  let candidateHost = forwardedHost || request.headers.host || "";

  // If host includes multiple comma-separated values, take the first one
  if (candidateHost.includes(",")) {
    const first = candidateHost.split(",")[0];
    candidateHost = first ? first.trim() : "";
  }

  // 2. Check if candidateHost is a local/loopback/private placeholder
  const isLoopbackOrPrivate =
    !candidateHost ||
    candidateHost.startsWith("127.0.0.1") ||
    candidateHost.startsWith("localhost") ||
    candidateHost.startsWith("::1") ||
    candidateHost.includes("18080") ||
    candidateHost.startsWith("tauri://") ||
    candidateHost.includes("<") ||
    candidateHost.includes(">");

  if (isLoopbackOrPrivate) {
    // Attempt resolution from fallback host, environment variable, or saved tunnel configuration
    if (fallbackPublicHost && !fallbackPublicHost.includes("127.0.0.1") && !fallbackPublicHost.includes("localhost")) {
      candidateHost = fallbackPublicHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    } else {
      const envHost = process.env.NEXUS_PUBLIC_HOST || process.env.LOCALBRIDGE_TUNNEL_HOST;
      if (envHost && !envHost.includes("127.0.0.1") && !envHost.includes("localhost")) {
        candidateHost = envHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      } else {
        // Try reading active tunnel config if available on disk
        const diskHost = readActiveTunnelHostFromDisk();
        if (diskHost) {
          candidateHost = diskHost;
        }
      }
    }
  }

  // 3. Fallback to candidate host if still local (e.g. in local development / unit tests)
  if (!candidateHost) {
    candidateHost = request.headers.host || "localhost:18080";
  }

  // 4. Determine protocol
  const isIpAddress =
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(candidateHost) ||
    candidateHost.startsWith("127.0.0.1") ||
    candidateHost.startsWith("localhost") ||
    candidateHost.startsWith("[::1]");

  const isPublicDomain =
    !isIpAddress &&
    (candidateHost.includes("localbridge.dev") ||
      candidateHost.includes("trycloudflare.com") ||
      candidateHost.includes("nexus") ||
      (candidateHost.includes(".") && !candidateHost.includes(":")));

  const protoHeader = request.headers["x-forwarded-proto"] as string;
  const proto = protoHeader === "https" || isPublicDomain ? "https" : "http";

  return `${proto}://${candidateHost}`.replace(/\/+$/, "");
}

/**
 * Reads active tunnel host from tunnel configuration if available.
 */
function readActiveTunnelHostFromDisk(): string | null {
  try {
    const dataDir =
      process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "LocalBridge")
        : path.join(os.homedir(), ".localbridge");

    const activeInfoPath = path.join(dataDir, "active-tunnel-host.txt");
    if (fs.existsSync(activeInfoPath)) {
      const content = fs.readFileSync(activeInfoPath, "utf-8").trim();
      if (content && !content.includes("127.0.0.1") && !content.includes("localhost")) {
        return content.replace(/^https?:\/\//, "");
      }
    }
  } catch {
    // Ignore file read errors
  }
  return null;
}
