import type { GitInfoParams, GitInfoResult } from "@localbridge/protocol";
import type { GitService } from "../../git/index.js";

export function createGitInfoHandler(gitService: GitService) {
  return async (params: GitInfoParams): Promise<GitInfoResult> => {
    return gitService.getInfo(params);
  };
}
