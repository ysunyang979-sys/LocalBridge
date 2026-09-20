import { z } from "zod";
import {
  RuntimeStateSchema,
  RuntimeLaunchSpecPackageScriptSchema,
  RuntimeLaunchSpecRegisteredCommandSchema,
  RuntimeLaunchSpecSchema,
  RuntimeSummarySchema,
  RuntimeStartParamsSchema,
  RuntimeStartResultSchema,
  RuntimeListParamsSchema,
  RuntimeListResultSchema,
  RuntimeStatusParamsSchema,
  RuntimeStatusResultSchema,
  RuntimeLogChunkSchema,
  RuntimeLogsParamsSchema,
  RuntimeLogsResultSchema,
  RuntimeRestartParamsSchema,
  RuntimeRestartResultSchema,
  RuntimeStopParamsSchema,
  RuntimeStopResultSchema,
} from "./schemas.js";

export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export type RuntimeLaunchSpecPackageScript = z.infer<
  typeof RuntimeLaunchSpecPackageScriptSchema
>;
export type RuntimeLaunchSpecRegisteredCommand = z.infer<
  typeof RuntimeLaunchSpecRegisteredCommandSchema
>;
export type RuntimeLaunchSpec = z.infer<typeof RuntimeLaunchSpecSchema>;

export type RuntimeSummary = z.infer<typeof RuntimeSummarySchema>;

export type RuntimeStartParams = z.infer<typeof RuntimeStartParamsSchema>;
export type RuntimeStartResult = z.infer<typeof RuntimeStartResultSchema>;

export type RuntimeListParams = z.infer<typeof RuntimeListParamsSchema>;
export type RuntimeListResult = z.infer<typeof RuntimeListResultSchema>;

export type RuntimeStatusParams = z.infer<typeof RuntimeStatusParamsSchema>;
export type RuntimeStatusResult = z.infer<typeof RuntimeStatusResultSchema>;

export type RuntimeLogChunk = z.infer<typeof RuntimeLogChunkSchema>;
export type RuntimeLogsParams = z.infer<typeof RuntimeLogsParamsSchema>;
export type RuntimeLogsResult = z.infer<typeof RuntimeLogsResultSchema>;

export type RuntimeRestartParams = z.infer<typeof RuntimeRestartParamsSchema>;
export type RuntimeRestartResult = z.infer<typeof RuntimeRestartResultSchema>;

export type RuntimeStopParams = z.infer<typeof RuntimeStopParamsSchema>;
export type RuntimeStopResult = z.infer<typeof RuntimeStopResultSchema>;
