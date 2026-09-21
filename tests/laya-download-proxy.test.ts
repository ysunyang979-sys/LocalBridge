import { describe, it, expect } from "vitest";
import {
  normalizeProxyUrl,
  resolveSystemProxy,
  createHttpConnectProxyAgent,
} from "../packages/security/src/intelligence/downloader.js";

describe("Laya Proxy Resolution & CONNECT Tunnel Suite", () => {
  it("normalizes proxy URLs correctly", () => {
    expect(normalizeProxyUrl("127.0.0.1:10808")).toBe("http://127.0.0.1:10808");
    expect(normalizeProxyUrl("http://127.0.0.1:10808")).toBe("http://127.0.0.1:10808");
    expect(normalizeProxyUrl("https://user:pass@proxy.corp:8443/")).toBe("https://user:pass@proxy.corp:8443");
  });

  it("resolves system proxy on Windows without throwing errors", () => {
    const sysProxy = resolveSystemProxy();
    // On this Windows dev machine, registry query should return 127.0.0.1:10808 or null if disabled
    if (sysProxy) {
      expect(sysProxy).toMatch(/^https?:\/\//);
    }
  });

  it("creates HTTP CONNECT https.Agent with valid host and port parameters", () => {
    const agent = createHttpConnectProxyAgent("http://127.0.0.1:10808");
    expect(agent).toBeDefined();
    expect(typeof (agent as any).createConnection).toBe("function");
  });
});
