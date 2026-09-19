export interface McpPrincipal {
  id: string;
  authType: "localbridge-token" | "oauth";
  scopes: string[];
  tokenId: string;
}

export const MCP_PROTOCOL_VERSION = "2026-07-28";
export const MAX_MCP_BODY_BYTES = 1048576; // 1 MiB (1,048,576 bytes)
export const MAX_MCP_RESULT_BYTES = 524288; // 512 KiB (524,288 bytes)
export const MCP_MAX_REQUESTS_PER_MINUTE = 60;
export const MCP_MAX_CONCURRENT_REQUESTS = 10;

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface McpToolTextContent {
  type: "text";
  text: string;
}

export interface McpToolResponse {
  [key: string]: unknown;
  content: McpToolTextContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}
