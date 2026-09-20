export interface Position {
  /** 0-based line index */
  line: number;
  /** 0-based character offset on the line */
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  path: string;
  range: Range;
}

export type SymbolKindString =
  | "file"
  | "module"
  | "namespace"
  | "package"
  | "class"
  | "method"
  | "property"
  | "field"
  | "constructor"
  | "enum"
  | "interface"
  | "function"
  | "variable"
  | "constant"
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "key"
  | "null"
  | "enumMember"
  | "struct"
  | "event"
  | "operator"
  | "typeParameter"
  | "unknown";

export interface DocumentSymbolItem {
  name: string;
  kind: SymbolKindString;
  range: Range;
  selectionRange: Range;
  containerName?: string;
  children?: DocumentSymbolItem[];
}

export interface DocumentSymbolsResult {
  symbols: DocumentSymbolItem[];
  truncated: boolean;
}

export interface WorkspaceSymbolItem {
  name: string;
  kind: SymbolKindString;
  path: string;
  range: Range;
  containerName?: string;
}

export interface WorkspaceSymbolsResult {
  symbols: WorkspaceSymbolItem[];
  truncated: boolean;
}

export interface DefinitionItem {
  path: string;
  range: Range;
  preview?: string;
}

export interface DefinitionResult {
  definitions: DefinitionItem[];
}

export interface ReferenceItem {
  path: string;
  range: Range;
  isDefinition?: boolean;
}

export interface ReferencesResult {
  references: ReferenceItem[];
  totalCount: number;
  truncated: boolean;
}

export interface HoverResult {
  symbol?: string;
  type?: string;
  signature?: string;
  documentation?: string;
  range?: Range;
}

export type DiagnosticSeverity = "error" | "warning" | "information" | "hint";

export interface DiagnosticItem {
  path: string;
  severity: DiagnosticSeverity;
  message: string;
  code?: string | number;
  source?: string;
  range: Range;
}

export interface DiagnosticsResult {
  diagnostics: DiagnosticItem[];
  totalCount: number;
  truncated: boolean;
}

export interface CallHierarchyCallItem {
  symbol: string;
  path: string;
  range: Range;
  fromRanges?: Range[];
  calls?: CallHierarchyCallItem[];
}

export interface CallHierarchyResult {
  symbol: string;
  path: string;
  range: Range;
  direction: "incoming" | "outgoing";
  calls: CallHierarchyCallItem[];
}

export interface CodeImpactSummary {
  totalReferences: number;
  totalCallers: number;
  totalCallees: number;
  affectedFilesCount: number;
}

export interface CodeImpactResult {
  targetSymbol: string;
  definition?: DefinitionItem;
  referenceCount: number;
  directCallers: number;
  directCallees: number;
  affectedFiles: string[];
  impactSummary: CodeImpactSummary;
}

export type LspLifecycleStatus =
  | "ready"
  | "starting"
  | "unavailable"
  | "error"
  | "stopped";

export interface LspServerStatus {
  projectId: string;
  language: string;
  serverKind: string;
  status: LspLifecycleStatus;
  pid?: number;
  startedAt?: number;
  restartCount: number;
  lastError?: string;
}

export interface LspStatusResult {
  servers: LspServerStatus[];
}

export interface LspRestartResult {
  projectId: string;
  restarted: boolean;
  status: LspServerStatus;
}

export interface LspStopResult {
  projectId: string;
  stopped: boolean;
}
