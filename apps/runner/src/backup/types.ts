export type BackupOperationType = "write" | "patch" | "delete";

export interface BackupMetadata {
  operationId: string;
  projectId: string;
  relativePath: string;
  operation: BackupOperationType;
  createdAt: number;
  oldHash: string;
  contentHash: string;
  newHash: string | null;
  size: number;
  mode: number;
}
