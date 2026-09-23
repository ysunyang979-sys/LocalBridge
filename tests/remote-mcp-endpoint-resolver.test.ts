import { describe, it, expect } from "vitest";
import { RemoteMcpEndpointResolver } from "../packages/protocol/src/connections/endpoint-resolver.js";

describe("RemoteMcpEndpointResolver - Strict Production Resolution", () => {
  it("strictly rejects fake domains and never synthesizes .nexus.localbridge.dev", () => {
    const res = RemoteMcpEndpointResolver.resolve({
      status: "Connected",
      tunnel_id: "tunnel_6ab2ad673ad48191ab3520da397d9643",
      configured: true,
    });

    expect(res.isAvailable).toBe(false);
    expect(res.endpoint).toBeNull();
    expect(res.baseHost).toBeNull();
    expect(res.status).toBe("not_configured");
  });

  it("strictly rejects bare Cloudflare Tunnel UUID as a hostname", () => {
    const res = RemoteMcpEndpointResolver.resolve({
      status: "Connected",
      tunnel_id: "11111111-2222-3333-4444-555555555555",
      configured: true,
    });

    expect(res.isAvailable).toBe(false);
    expect(res.endpoint).toBeNull();
    expect(res.status).toBe("not_configured");
  });

  it("resolves canonical production hostname mcp.example.com", () => {
    const res = RemoteMcpEndpointResolver.resolve({
      status: "Connected",
      public_hostname: "mcp.example.com",
      configured: true,
    });

    expect(res.isAvailable).toBe(true);
    expect(res.endpoint).toBe("https://mcp.example.com/mcp");
    expect(res.baseHost).toBe("mcp.example.com");
    expect(res.status).toBe("connected");
  });

  it("resolves canonical production base URL https://mcp.example.com", () => {
    const res = RemoteMcpEndpointResolver.resolve({
      status: "Connected",
      public_base_url: "https://mcp.example.com",
      configured: true,
    });

    expect(res.isAvailable).toBe(true);
    expect(res.endpoint).toBe("https://mcp.example.com/mcp");
    expect(res.baseHost).toBe("mcp.example.com");
  });

  it("resolves Quick Tunnel trycloudflare.com URL", () => {
    const res = RemoteMcpEndpointResolver.resolve({
      status: "Connected",
      tunnel_url: "https://quick-tunnel-sample.trycloudflare.com",
      configured: true,
    });

    expect(res.isAvailable).toBe(true);
    expect(res.endpoint).toBe("https://quick-tunnel-sample.trycloudflare.com/mcp");
    expect(res.baseHost).toBe("quick-tunnel-sample.trycloudflare.com");
  });

  it("generates correct client snippet for valid endpoints", () => {
    const snippet = RemoteMcpEndpointResolver.generateSnippet(
      {
        status: "Connected",
        public_hostname: "mcp.example.com",
        configured: true,
      },
      "token_abc_123"
    );

    expect(snippet).not.toBeNull();
    expect(snippet?.mcpServers.nexus.url).toBe("https://mcp.example.com/mcp");
    expect(snippet?.mcpServers.nexus.headers.Authorization).toBe("Bearer token_abc_123");
  });

  it("returns null snippet if endpoint is unavailable", () => {
    const snippet = RemoteMcpEndpointResolver.generateSnippet({
      status: "Connected",
      tunnel_id: "tunnel_fake_123",
      configured: true,
    });

    expect(snippet).toBeNull();
  });
});
