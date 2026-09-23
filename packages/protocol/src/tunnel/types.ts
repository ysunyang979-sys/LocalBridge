import { z } from "zod";

export const TunnelNetworkModeSchema = z.enum(["direct", "system", "custom"]);
export type TunnelNetworkMode = z.infer<typeof TunnelNetworkModeSchema>;

export const SystemProxyInfoSchema = z.object({
  enabled: z.boolean(),
  proxyUrl: z.string().optional(),
  source: z.enum(["system", "manual", "none"]),
  pacUrl: z.string().optional(),
  supported: z.boolean(),
  error: z.string().optional(),
});
export type SystemProxyInfo = z.infer<typeof SystemProxyInfoSchema>;

export const TunnelEnvironmentConfigSchema = z.object({
  networkMode: TunnelNetworkModeSchema,
  systemProxy: z.string().optional(),
  customProxy: z.string().optional(),
});
export type TunnelEnvironmentConfig = z.infer<typeof TunnelEnvironmentConfigSchema>;

export const TunnelConnectionMetricsSchema = z.object({
  processAlive: z.boolean(),
  health: z.boolean(),
  ready: z.boolean(),
  controlPlaneConnected: z.boolean(),
  lastSuccessfulPollAt: z.number().optional(),
  pollErrors: z.number().default(0),
  activeProxyUrl: z.string().optional(),
  networkMode: TunnelNetworkModeSchema.optional(),
});
export type TunnelConnectionMetrics = z.infer<typeof TunnelConnectionMetricsSchema>;

export const TunnelTestConnectionResultSchema = z.object({
  success: z.boolean(),
  stage: z.enum(["local_mcp", "proxy_connect", "control_plane_tls", "tunnel_metrics"]),
  mcpServerOnline: z.boolean(),
  mcpServerUrl: z.string(),
  hasMcpToken: z.boolean(),
  proxyReachable: z.boolean().optional(),
  controlPlaneTlsOk: z.boolean().optional(),
  controlPlaneConnected: z.boolean().optional(),
  lastSuccessfulPollAt: z.number().optional(),
  pollErrors: z.number().optional(),
  message: z.string(),
  diagnosticCode: z.string().optional(),
});
export type TunnelTestConnectionResult = z.infer<typeof TunnelTestConnectionResultSchema>;

export const TunnelStatusDtoSchema = z.object({
  configured: z.boolean(),
  status: z.string(),
  tunnel_id: z.string().nullable().optional(),
  has_api_key: z.boolean(),
  has_mcp_token: z.boolean(),
  auto_reconnect: z.boolean(),
  health_port: z.number(),
  network_mode: TunnelNetworkModeSchema,
  custom_proxy_url: z.string().nullable().optional(),
  active_proxy_url: z.string().nullable().optional(),
  proxy_status: z.enum(["Reachable", "Unreachable", "Unsupported", "NotConfigured"]).nullable().optional(),
  control_plane_status: z.enum(["Connected", "ConnectionFailed", "Polling", "Idle"]).nullable().optional(),
  control_plane_connected: z.boolean().optional(),
  local_mcp_status: z.enum(["Connected", "Failed"]).nullable().optional(),
  last_successful_poll_at: z.number().nullable().optional(),
  poll_errors: z.number().default(0),
  error_message: z.string().nullable().optional(),
  reconnect_attempts: z.number(),
  public_hostname: z.string().nullable().optional(),
  public_base_url: z.string().nullable().optional(),
  mcp_endpoint: z.string().nullable().optional(),
  tunnel_mode: z.enum(["quick", "managed"]).nullable().optional(),
  dns_status: z.enum(["configured", "not_configured", "pending", "error"]).nullable().optional(),
  cloudflare_account_id: z.string().nullable().optional(),
});
export type TunnelStatusDto = z.infer<typeof TunnelStatusDtoSchema>;
