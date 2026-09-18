import type {
  FileRestoreParams,
  FileRestoreResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";

export function createFileRestoreHandler(fsService: FilesystemService) {
  return async (params: FileRestoreParams): Promise<FileRestoreResult> => {
    return fsService.restoreFile(params);
  };
}
