import { fromJsonSchema } from "@modelcontextprotocol/server";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";

/**
 * Convert a Zod schema into an MCP-compliant Standard Schema using JSON Schema.
 * Strips $schema to ensure compatibility across all MCP client tooling.
 */
export function toMcpSchema<T extends z.ZodTypeAny>(zodSchema: T) {
  const jsonSchema = zodToJsonSchema(zodSchema) as Record<string, unknown>;
  delete jsonSchema["$schema"];
  return fromJsonSchema(jsonSchema);
}
