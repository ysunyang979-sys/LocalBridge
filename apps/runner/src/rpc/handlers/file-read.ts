import type {
  FileReadParams,
  FileReadResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";

export function createFileReadHandler(fsService: FilesystemService) {
  return async (params: FileReadParams): Promise<FileReadResult> => {
    return fsService.readText(params);
  };
}
