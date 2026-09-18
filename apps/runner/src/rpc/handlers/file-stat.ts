import type {
  FileStatParams,
  FileStatResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";

export function createFileStatHandler(fsService: FilesystemService) {
  return async (params: FileStatParams): Promise<FileStatResult> => {
    return fsService.stat(params);
  };
}
