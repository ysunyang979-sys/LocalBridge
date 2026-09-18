export const RunnerRpcMethods = {
  Hello: "runner.hello",
  SystemPing: "system.ping",
  SystemInfo: "system.info",
  ProjectList: "project.list",
  ProjectInfo: "project.info",
  ProjectValidate: "project.validate",
  DirectoryList: "directory.list",
  FileStat: "file.stat",
  FileRead: "file.read",
  FileCreate: "file.create",
  FileWrite: "file.write",
  FilePatch: "file.patch",
  FileDelete: "file.delete",
  FileRestore: "file.restore",
} as const;

export type RunnerRpcMethod =
  (typeof RunnerRpcMethods)[keyof typeof RunnerRpcMethods];

export const RunnerMethod = {
  RUNNER_HELLO: RunnerRpcMethods.Hello,
  SYSTEM_PING: RunnerRpcMethods.SystemPing,
  SYSTEM_INFO: RunnerRpcMethods.SystemInfo,
  PROJECT_VALIDATE: RunnerRpcMethods.ProjectValidate,
  DIRECTORY_LIST: RunnerRpcMethods.DirectoryList,
  FILE_STAT: RunnerRpcMethods.FileStat,
  FILE_READ: RunnerRpcMethods.FileRead,
  FILE_CREATE: RunnerRpcMethods.FileCreate,
  FILE_WRITE: RunnerRpcMethods.FileWrite,
  FILE_PATCH: RunnerRpcMethods.FilePatch,
  FILE_DELETE: RunnerRpcMethods.FileDelete,
  FILE_RESTORE: RunnerRpcMethods.FileRestore,
  FILE_SEARCH: "file.search",
  TEXT_SEARCH: "text.search",
  SHELL_RUN: "shell.run",
  GIT_STATUS: "git.status",
  GIT_DIFF: "git.diff",
  GIT_LOG: "git.log",
  JOB_START: "job.start",
  JOB_STATUS: "job.status",
  JOB_LOGS: "job.logs",
  JOB_CANCEL: "job.cancel",
} as const;

export type RunnerMethod = (typeof RunnerMethod)[keyof typeof RunnerMethod];
