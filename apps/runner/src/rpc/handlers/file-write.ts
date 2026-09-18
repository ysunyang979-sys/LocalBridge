import type {
  FileWriteParams,
  FileWriteResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";

export function createFileWriteHandler(fsService: FilesystemService) {
  return async (params: FileWriteParams): Promise<FileWriteResult> => {
    return fsService.writeFile(params);
  };
}
