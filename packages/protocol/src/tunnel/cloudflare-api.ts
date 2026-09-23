export interface CloudflareTokenVerifyResult {
  valid: boolean;
  status: string;
  id?: string;
  error?: string;
}

export interface CloudflareZoneResult {
  found: boolean;
  zoneId?: string;
  name?: string;
  status?: string;
  error?: string;
}

export interface CloudflareDnsSyncResult {
  success: boolean;
  recordId?: string;
  created?: boolean;
  cnameTarget?: string;
  error?: string;
}

export interface CloudflareIngressSyncResult {
  success: boolean;
  error?: string;
}

export interface PublicDnsCheckResult {
  resolves: boolean;
  status: number; // 0 = OK, 3 = NXDOMAIN
  ips: string[];
  cname?: string;
  provider: string;
}

export class CloudflareApiService {
  private static readonly API_BASE = "https://api.cloudflare.com/client/v4";

  /**
   * Verifies the Cloudflare User API Token.
   */
  static async verifyApiToken(token: string): Promise<CloudflareTokenVerifyResult> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      return { valid: false, status: "empty", error: "Token is empty" };
    }

    try {
      const res = await fetch(`${this.API_BASE}/user/tokens/verify`, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
        },
      });

      const data = (await res.json()) as any;
      if (res.ok && data.success && data.result?.status === "active") {
        return {
          valid: true,
          status: "active",
          id: data.result?.id,
        };
      }

      const errMsg = data.errors?.[0]?.message || "Invalid or inactive token";
      return {
        valid: false,
        status: data.result?.status || "invalid",
        error: errMsg,
      };
    } catch (err: any) {
      return {
        valid: false,
        status: "network_error",
        error: err.message || String(err),
      };
    }
  }

  /**
   * Finds the Zone for the given root domain (e.g. example.com).
   */
  static async detectZone(token: string, domain: string): Promise<CloudflareZoneResult> {
    const cleanToken = token.trim();
    const cleanDomain = domain.toLowerCase().trim();

    try {
      const res = await fetch(`${this.API_BASE}/zones?name=${encodeURIComponent(cleanDomain)}`, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
        },
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.success) {
        const errMsg = data.errors?.[0]?.message || `HTTP ${res.status}`;
        return { found: false, error: errMsg };
      }

      if (!data.result || data.result.length === 0) {
        return {
          found: false,
          error: `Domain ${cleanDomain} is not connected to Cloudflare under this account.`,
        };
      }

      const zone = data.result[0];
      return {
        found: true,
        zoneId: zone.id,
        name: zone.name,
        status: zone.status,
      };
    } catch (err: any) {
      return {
        found: false,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Synchronizes CNAME record for subDomain pointing to Tunnel Argo target.
   * e.g. hostname: mcp.example.com -> <tunnel-uuid>.cfargotunnel.com
   */
  static async syncTunnelDns(params: {
    token: string;
    zoneId: string;
    subDomain: string;
    tunnelUuid: string;
  }): Promise<CloudflareDnsSyncResult> {
    const { token, zoneId, subDomain, tunnelUuid } = params;
    const cleanToken = token.trim();
    const cnameTarget = `${tunnelUuid}.cfargotunnel.com`;

    try {
      // 1. Check existing DNS records
      const listRes = await fetch(
        `${this.API_BASE}/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(subDomain)}`,
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const listData = (await listRes.json()) as any;
      if (!listRes.ok || !listData.success) {
        const errMsg = listData.errors?.[0]?.message || `HTTP ${listRes.status}`;
        return { success: false, error: errMsg };
      }

      const existing = listData.result?.[0];

      if (existing) {
        // Record exists, update if needed
        if (existing.content === cnameTarget && existing.proxied === true) {
          return {
            success: true,
            recordId: existing.id,
            created: false,
            cnameTarget,
          };
        }

        const updateRes = await fetch(`${this.API_BASE}/zones/${zoneId}/dns_records/${existing.id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "CNAME",
            name: subDomain,
            content: cnameTarget,
            ttl: 1, // Auto TTL
            proxied: true,
          }),
        });

        const updateData = (await updateRes.json()) as any;
        if (!updateRes.ok || !updateData.success) {
          const errMsg = updateData.errors?.[0]?.message || `HTTP ${updateRes.status}`;
          return { success: false, error: errMsg };
        }

        return {
          success: true,
          recordId: existing.id,
          created: false,
          cnameTarget,
        };
      }

      // Record does not exist, create new CNAME
      const createRes = await fetch(`${this.API_BASE}/zones/${zoneId}/dns_records`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "CNAME",
          name: subDomain,
          content: cnameTarget,
          ttl: 1,
          proxied: true,
        }),
      });

      const createData = (await createRes.json()) as any;
      if (!createRes.ok || !createData.success) {
        const errMsg = createData.errors?.[0]?.message || `HTTP ${createRes.status}`;
        return { success: false, error: errMsg };
      }

      return {
        success: true,
        recordId: createData.result?.id,
        created: true,
        cnameTarget,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Configures Cloudflare Managed Tunnel Ingress rule.
   * Routes hostname -> http://127.0.0.1:8787
   */
  static async syncTunnelIngress(params: {
    token: string;
    accountId: string;
    tunnelUuid: string;
    hostname: string;
    targetService?: string;
  }): Promise<CloudflareIngressSyncResult> {
    const {
      token,
      accountId,
      tunnelUuid,
      hostname,
      targetService = "http://127.0.0.1:8787",
    } = params;
    const cleanToken = token.trim();

    try {
      const configUrl = `${this.API_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelUuid}/configurations`;

      // Read current config to preserve other ingress rules if any
      const getRes = await fetch(configUrl, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
        },
      });

      let currentIngress: any[] = [];
      if (getRes.ok) {
        const getData = (await getRes.json()) as any;
        if (getData.result?.config?.ingress) {
          currentIngress = getData.result.config.ingress;
        }
      }

      // Filter out existing rule for this hostname and the 404 catch-all
      const filtered = currentIngress.filter(
        (r) => r.hostname && r.hostname.toLowerCase() !== hostname.toLowerCase() && r.service !== "http_status:404"
      );

      // Add our rule and 404 catch-all at the end
      const updatedIngress = [
        ...filtered,
        {
          hostname: hostname.toLowerCase().trim(),
          service: targetService,
        },
        {
          service: "http_status:404",
        },
      ];

      const putRes = await fetch(configUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: {
            ingress: updatedIngress,
          },
        }),
      });

      const putData = (await putRes.json()) as any;
      if (!putRes.ok || !putData.success) {
        const errMsg = putData.errors?.[0]?.message || `HTTP ${putRes.status}`;
        return { success: false, error: errMsg };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Checks public DNS resolution for hostname via Cloudflare / Google DoH.
   */
  static async checkPublicDns(hostname: string): Promise<PublicDnsCheckResult> {
    const cleanHost = hostname.trim();

    // Try Cloudflare DoH first
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanHost)}`, {
        headers: { accept: "application/dns-json" },
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const ips: string[] = [];
        let cname: string | undefined;

        if (data.Answer) {
          for (const ans of data.Answer) {
            if (ans.type === 1) ips.push(ans.data); // A record
            if (ans.type === 5) cname = ans.data; // CNAME record
          }
        }

        return {
          resolves: data.Status === 0 && (ips.length > 0 || !!cname),
          status: data.Status,
          ips,
          cname,
          provider: "cloudflare",
        };
      }
    } catch {}

    // Fallback to Google DoH
    try {
      const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(cleanHost)}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        const ips: string[] = [];
        let cname: string | undefined;

        if (data.Answer) {
          for (const ans of data.Answer) {
            if (ans.type === 1) ips.push(ans.data);
            if (ans.type === 5) cname = ans.data;
          }
        }

        return {
          resolves: data.Status === 0 && (ips.length > 0 || !!cname),
          status: data.Status,
          ips,
          cname,
          provider: "google",
        };
      }
    } catch {}

    return {
      resolves: false,
      status: -1,
      ips: [],
      provider: "none",
    };
  }
}
