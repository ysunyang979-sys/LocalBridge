import { z } from "zod";

export const PositionSchema = z.object({
  line: z.number().int().min(0).describe("0-based line index"),
  character: z.number().int().min(0).describe("0-based character offset"),
});

export const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
});

export const LocationSchema = z.object({
  path: z.string(),
  range: RangeSchema,
});

export const CodeDocumentSymbolsParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    path: z.string().min(1).describe("Relative path to source file inside project"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type CodeDocumentSymbolsParams = z.infer<typeof CodeDocumentSymbolsParamsSchema>;

export const CodeWorkspaceSymbolsParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    query: z.string().describe("Symbol search query. Non-empty string recommended"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .optional()
      .describe("Maximum number of symbols to return (max 200, default 50)"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type CodeWorkspaceSymbolsParams = z.infer<typeof CodeWorkspaceSymbolsParamsSchema>;

export const CodeDefinitionParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    path: z.string().min(1).describe("Relative path to source file inside project"),
    line: z.number().int().min(0).describe("0-based line index"),
    character: z.number().int().min(0).describe("0-based character offset"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type CodeDefinitionParams = z.infer<typeof CodeDefinitionParamsSchema>;

export const CodeReferencesParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    path: z.string().min(1).describe("Relative path to source file inside project"),
    line: z.number().int().min(0).describe("0-based line index"),
    character: z.number().int().min(0).describe("0-based character offset"),
    includeDeclaration: z
      .boolean()
      .default(false)
      .optional()
      .describe("Include the symbol declaration in the references result"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .optional()
      .describe("Maximum number of references to return (max 500, default 100)"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type CodeReferencesParams = z.infer<typeof CodeReferencesParamsSchema>;

export const CodeHoverParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    path: z.string().min(1).describe("Relative path to source file inside project"),
    line: z.number().int().min(0).describe("0-based line index"),
    character: z.number().int().min(0).describe("0-based character offset"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type CodeHoverParams = z.infer<typeof CodeHoverParamsSchema>;

export const CodeDiagnosticsParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    path: z
      .string()
      .min(1)
      .optional()
      .describe("Optional relative file path to restrict diagnostics to a single file"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .optional()
      .describe("Maximum number of diagnostics to return (max 500, default 100)"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type CodeDiagnosticsParams = z.infer<typeof CodeDiagnosticsParamsSchema>;

export const CodeCallHierarchyParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    path: z.string().min(1).describe("Relative path to source file inside project"),
    line: z.number().int().min(0).describe("0-based line index"),
    character: z.number().int().min(0).describe("0-based character offset"),
    direction: z
      .enum(["incoming", "outgoing"])
      .describe("Call direction: incoming (callers) or outgoing (callees)"),
    depth: z
      .number()
      .int()
      .min(1)
      .max(3)
      .default(1)
      .optional()
      .describe("Call hierarchy traversal depth (1 to 3, default 1)"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type CodeCallHierarchyParams = z.infer<typeof CodeCallHierarchyParamsSchema>;

export const CodeImpactParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    path: z.string().min(1).describe("Relative path to source file inside project"),
    line: z.number().int().min(0).describe("0-based line index"),
    character: z.number().int().min(0).describe("0-based character offset"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type CodeImpactParams = z.infer<typeof CodeImpactParamsSchema>;

export const LspStatusParamsSchema = z
  .object({
    projectId: z.string().min(1).optional().describe("Optional project identifier filter"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type LspStatusParams = z.infer<typeof LspStatusParamsSchema>;

export const LspRestartParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type LspRestartParams = z.infer<typeof LspRestartParamsSchema>;

export const LspStopParamsSchema = z
  .object({
    projectId: z.string().min(1).describe("Target project identifier"),
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional session identifier to resolve worktree context"),
  })
  .strict();

export type LspStopParams = z.infer<typeof LspStopParamsSchema>;

// Result schemas
export const DocumentSymbolsResultSchema = z.object({
  symbols: z.array(z.any()),
  truncated: z.boolean(),
});

export const WorkspaceSymbolsResultSchema = z.object({
  symbols: z.array(z.any()),
  truncated: z.boolean(),
});

export const DefinitionResultSchema = z.object({
  definitions: z.array(z.any()),
});

export const ReferencesResultSchema = z.object({
  references: z.array(z.any()),
  totalCount: z.number(),
  truncated: z.boolean(),
});

export const HoverResultSchema = z.object({
  symbol: z.string().optional(),
  type: z.string().optional(),
  signature: z.string().optional(),
  documentation: z.string().optional(),
  range: RangeSchema.optional(),
});

export const DiagnosticsResultSchema = z.object({
  diagnostics: z.array(z.any()),
  totalCount: z.number(),
  truncated: z.boolean(),
});

export const CallHierarchyResultSchema = z.object({
  symbol: z.string(),
  path: z.string(),
  range: RangeSchema,
  direction: z.enum(["incoming", "outgoing"]),
  calls: z.array(z.any()),
});

export const CodeImpactResultSchema = z.object({
  targetSymbol: z.string(),
  definition: z.any().optional(),
  referenceCount: z.number(),
  directCallers: z.number(),
  directCallees: z.number(),
  affectedFiles: z.array(z.string()),
  impactSummary: z.object({
    totalReferences: z.number(),
    totalCallers: z.number(),
    totalCallees: z.number(),
    affectedFilesCount: z.number(),
  }),
});

export const LspStatusResultSchema = z.object({
  servers: z.array(z.any()),
});

export const LspRestartResultSchema = z.object({
  projectId: z.string(),
  restarted: z.boolean(),
  status: z.any(),
});

export const LspStopResultSchema = z.object({
  projectId: z.string(),
  stopped: z.boolean(),
});

