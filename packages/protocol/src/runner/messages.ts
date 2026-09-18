import { z } from "zod";

export const JsonRpcIdSchema = z.union([z.string(), z.number()]);
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcIdSchema,
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export type JsonRpcRequest<TParams = Record<string, unknown>> = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: TParams;
};

export const JsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

export type JsonRpcErrorData = z.infer<typeof JsonRpcErrorSchema>;

export const JsonRpcResponseSuccessSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcIdSchema,
  result: z.unknown(),
});

export type JsonRpcResponseSuccess<TResult = unknown> = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: TResult;
};

export const JsonRpcResponseErrorSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcIdSchema.nullable(),
  error: JsonRpcErrorSchema,
});

export type JsonRpcResponseError = z.infer<typeof JsonRpcResponseErrorSchema>;

export const JsonRpcResponseSchema = z.union([
  JsonRpcResponseSuccessSchema,
  JsonRpcResponseErrorSchema,
]);

export type JsonRpcResponse<TResult = unknown> =
  | JsonRpcResponseSuccess<TResult>
  | JsonRpcResponseError;

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export type JsonRpcNotification<TParams = Record<string, unknown>> = {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
};

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;
