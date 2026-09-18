import type { GitLogParams, GitLogResult } from "@localbridge/protocol";
import type { GitService } from "../../git/index.js";

export function createGitLogHandler(gitService: GitService) {
  return async (params: GitLogParams): Promise<GitLogResult> => {
    return gitService.getLog(params);
  };
}
