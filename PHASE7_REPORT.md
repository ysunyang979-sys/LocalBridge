# LocalBridge Phase 7 Implementation Report: Safe Read-Only Git Inspection & Diff Engine

**Phase**: 7 COMPLETE  
**Status**: SUCCESS  
**Version**: 0.7.0  
**Baseline Commit**: `927ba16` (`feat: add transactional filesystem writes`)  
**Runtime**: Node.js `v24.21.0`, pnpm `10.14.0`, Windows x64  
**Git Version**: `2.46.2.windows.1`  
**Test Results**: 41 test files passed, 304 tests passed, 0 failures (100% pass rate)

---

## 1. Phase 7 核心交付目标与完成状态

Phase 7 的核心目标是在用户授权项目边界内实现安全、严格只读的 Git 仓库检查与 Unified Diff 差异比对引擎，使 AI 能够准确获知工作区变更、暂存区改动、代码差异以及最近提交历史，同时严格杜绝任意代码执行、代码修改、命令注入与物理路径/敏感凭证泄露。

本阶段四大只读 RPC（`git.info`、`git.status`、`git.diff`、`git.log`）全部高标准交付，所有安全隔离与加固策略均已通过自动化测试严格验证。

---

## 2. 引入的 4 个 Git RPC 接口定义与数据结构

在 `@localbridge/protocol` 中新增并注册了 4 个强类型 RPC 方法：

### 2.1 `git.info`
- **入参**: `{ projectId: string }`
- **返回**:
  ```ts
  {
    projectId: string;
    isRepository: boolean;
    branch: string | null;
    detached: boolean;
    head: string | null;
    shortHead: string | null;
    hasUpstream: boolean;
  }
  ```
- **特性**: 对非 Git 项目优雅返回 `isRepository: false`，不抛出异常。

### 2.2 `git.status`
- **入参**: `{ projectId: string }`
- **返回**:
  ```ts
  {
    projectId: string;
    branch: string | null;
    detached: boolean;
    ahead: number;
    behind: number;
    clean: boolean;
    entries: Array<{
      path: string;
      indexStatus: string;
      worktreeStatus: string;
      kind: "modified" | "added" | "deleted" | "renamed" | "typechanged" | "untracked" | "conflicted";
      oldPath?: string;
    }>;
    sensitiveEntriesFiltered: boolean;
    truncated: boolean;
  }
  ```

### 2.3 `git.diff`
- **入参**:
  ```ts
  {
    projectId: string;
    scope?: "unstaged" | "staged"; // default: "unstaged"
    path?: string; // optional single-file scoping
    contextLines?: number; // 0..20, default: 3
  }
  ```
- **返回**:
  ```ts
  {
    projectId: string;
    scope: "unstaged" | "staged";
    files: string[];
    diff: string;
    sensitiveEntriesFiltered: boolean;
    symlinkEntriesFiltered: boolean;
    submoduleEntriesFiltered: boolean;
  }
  ```

### 2.4 `git.log`
- **入参**:
  ```ts
  {
    projectId: string;
    limit?: number; // 1..100, default: 20
    path?: string; // optional single-file scoping
  }
  ```
- **返回**:
  ```ts
  {
    projectId: string;
    commits: Array<{
      hash: string;
      shortHash: string;
      authorName: string;
      timestamp: number; // milliseconds
      subject: string;
    }>;
  }
  ```

---

## 3. 严格只读原则的落实机制

1. **零写操作实现**: 代码库完全未实现任何 Git 修改或写操作（无 `git.add`、`git.commit`、`git.checkout`、`git.switch`、`git.restore`、`git.reset`、`git.clean`、`git.merge`、`git.rebase`、`git.push`、`git.pull`、`git.fetch`、`git.clone`、`git.config` 写入等）。
2. **零透传与参数白名单**: 不提供任何形如 `git.run` 或通用参数透传接口，所有执行的 Git 命令均由内部固定组装，仅接收强类型校验后的枚举与数字参数。
3. **彻底禁止 Shell**: 依然完全不实现 `shell.run`。

---

## 4. 仓库边界策略 (Repository Root Boundary)

- **物理根完全一致性**: 执行 `git rev-parse --is-inside-work-tree --show-toplevel`，获取当前 Git 仓库的物理规范根目录，并将其与项目的 `canonicalRoot` 进行基于 `fs.realpathSync.native` 的严格等值比对。
- **子目录拦截**: 若用户授权的项目目录实际上是上级父 Git 仓库的一个子目录，执行直接拦截并抛出 `GIT_REPOSITORY_BOUNDARY`，杜绝 AI 意外获知父仓库全局历史或跨子项目信息。
- **所有权安全**: 若 Git 报告 `detected dubious ownership`，转换为 `GIT_UNSAFE_REPOSITORY` 抛出。

---

## 5. 进程执行安全性 (No Shell Execution)

- 在 `apps/runner/src/git/process.ts` 中，使用 `child_process.spawn("git", args, { shell: false, windowsHide: true })` 进行直接二进制调用。
- 严禁通过 `cmd.exe`、`powershell` 或 `sh` 执行，任何试图在参数中插入 `; & | $()` 等 Shell 元字符的行为均会被直接作为字面参数传递给 Git 处理，从根源消除命令注入可能。

---

## 6. 强制安全标志 (Hardened Base Flags)

每个 Git 子进程执行前，均强制注入最高优先级的安全标志：
- `--no-pager`: 禁用交互式分页器（`less` / `more`），防止进程挂起。
- `-c core.fsmonitor=false`: 强制关闭文件系统监视器，防止恶意仓库触发外部脚本执行。
- `-c diff.external=`: 强制清空外部 diff 程序配置，彻底挫败基于 `diff.external` 的代码执行利用链。
- `-c core.hooksPath=<emptyHooksDir>`: 将 Git Hooks 路径重定向至系统临时目录下的独立空文件夹，防止触发恶意 hooks 脚本。
- `--no-ext-diff`: 在执行 `git diff` 时强制禁用外部差异工具。
- `--no-textconv`: 强制禁用自定义转换过滤器，防止通过 `.gitattributes` 执行外部解码工具。

---

## 7. 环境变量隔离 (Environment Isolation)

为 Git 子进程注入严格的环境变量覆盖：
- `GIT_TERMINAL_PROMPT=0`: 强制禁用一切终端交互式提示（如凭证输入、确认提示）。
- `GIT_PAGER=cat` / `PAGER=cat`: 强制使用简单的流式输出替代交互式分页。
- `GIT_CONFIG_NOSYSTEM=1`: 忽略系统级可能存在的不安全配置。

---

## 8. 超时与内存缓冲上限

- **执行超时**: 默认单次命令超时 10 秒（`DEFAULT_GIT_TIMEOUT_MS = 10000`），硬性上限 30 秒。超时通过 `SIGKILL` 杀死子进程并抛出 `GIT_TIMEOUT`。
- **常规输出缓冲区**: 默认限制为 512 KiB，超出立即强杀进程并抛出 `GIT_OUTPUT_TOO_LARGE`。
- **Diff 缓冲区**: 限制为 256 KiB，超出立即强杀进程并抛出 `GIT_DIFF_TOO_LARGE`。

---

## 9. Git Porcelain v2 解析机制

- 使用标准机器可解析格式：`git status --porcelain=v2 --branch -uall -z`。
- 采用空字符（`\0`）作为字段与条目分隔符，彻底解决文件名中包含空格、制表符、换行符、引号或 Unicode/中文字符的解析脆弱性。
- 解析 `# branch.oid`、`# branch.head`、`# branch.upstream`、`# branch.ab`，精确计算 `ahead` 与 `behind` 数量。
- 解析普通变更条目（`1`）、重命名条目（`2`，提取 `oldPath`）、冲突条目（`u`）与未跟踪条目（`?`）。
- 变更条目硬上限为 500 项，超出自动截断并置 `truncated: true`。

---

## 10. Commit Log 解析机制

- 采用严格的 NUL 分隔格式：`git log -n <limit> -z --format=%H%x00%h%x00%an%x00%at%x00%s`。
- 提取完整的 40 位 SHA-1/SHA-256 Hash、短 Hash（`shortHash`）、作者昵称（`authorName`）、提交说明主题（`subject`）。
- 将 Unix 秒级时间戳（`%at`）统一转换为标准 JavaScript 毫秒级时间戳（`* 1000`）。
- 完美支持多行提交信息的首行过滤、中文提交说明与 Emoji 字符。
- 空仓库（无 Commit）或未找到文件历史时，安全返回 `commits: []`，不抛出异常。

---

## 11. 隐私屏障：敏感文件过滤机制

- 接入 `@localbridge/security` 中的 `isSensitiveFile`。
- 针对 `.env*`、`*.pem`、`*.key`、`id_rsa*`、`credentials.json`、`.aws/*`、`.ssh/*` 等关键敏感文件进行自动识别。
- **git.status**: 发现敏感文件变更时自动剔除出 `entries` 列表，且设置 `sensitiveEntriesFiltered = true`。此时即便工作区仅有敏感文件变化，`clean` 依然计算为 `false`，防范状态欺骗。
- **git.diff**:
  - 全项目 diff 时，自动从候选比对文件列表中剔除敏感文件，并设置 `sensitiveEntriesFiltered = true`。
  - 单文件 diff 时，若直接请求敏感文件路径，立即拦截并抛出 `GIT_SENSITIVE_PATH_BLOCKED`。
- **git.log**: 请求敏感文件路径历史时，直接拦截并抛出 `GIT_SENSITIVE_PATH_BLOCKED`。

---

## 12. 隐私屏障：Commit 历史中彻底剔除作者邮箱与提交正文

- 在 Git 格式化模板中，仅提取作者昵称 `%an`，严格禁止提取作者邮箱 `%ae`。
- 仅提取主题摘要 `%s`，严格禁止提取提交正文主体 `%b` / `%B`。
- 杜绝企业内部邮箱、私有通信地址及长篇内部设计说明无意流出到远端。

---

## 13. 隐私屏障：全 RPC 响应物理路径零泄露保证

- **全字段审计**: 通过 `tests/git-privacy.test.ts` 对全部 4 个 Git RPC 的 `JSON.stringify(result)` 序列化结果进行了穷举式断言检查。
- **零泄露承诺**:
  - 不含任何物理主机绝对路径（`canonicalRoot`）。
  - 不含任何盘符加反斜杠（`C:\`、`D:\`、`E:\` 等）。
  - 不含任何 `.git` 内部绝对目录路径。
  - 不含任何远端仓库连接串（Remote URLs）。
- **Diff 脱敏器**: `sanitizeDiffOutput` 确保即使文件内容或差异头意外产生物理绝对路径，也会被替换为 `<project-root>` 或 `<redacted-path>`。

---

## 14. 符号链接在 Diff 中的安全策略

- **单文件 Diff**: 若目标文件为软链接（文件系统层 `lstat.isSymbolicLink()` 或 Git 索引树模式 `120000`），直接阻断并抛出 `GIT_SYMLINK_DIFF_BLOCKED`。
- **全项目 Diff**: 自动排查变更文件列表，将软链接文件静默剔除出 diff 参数，并置 `symlinkEntriesFiltered: true`。

---

## 15. Git 子模块在 Diff 中的安全策略

- **单文件 Diff**: 若 Git 索引树条目模式为 `160000`（Git Submodule），拒绝比较并抛出 `GIT_SUBMODULE_NOT_SUPPORTED`。
- **全项目 Diff**: 自动将子模块条目剔除出 diff 列表，并置 `submoduleEntriesFiltered: true`。

---

## 16. 超大 Diff 处理策略

- Diff 进程执行前明确传入 `maxBufferBytes: 256 * 1024` 与 `isDiff: true`。
- 当差异输出体积超过 256 KiB 时，底层进程直接被 `SIGKILL` 终止，并抛出 `GIT_DIFF_TOO_LARGE`。
- 避免超大补丁拖垮 WebSocket 传输带宽与内存消耗。

---

## 17. 非 Git 项目与空仓库的处理表现

- **非 Git 项目**:
  - `git.info`: 返回 `{ isRepository: false, branch: null, detached: false, head: null, shortHead: null, hasUpstream: false }`。
  - `git.status` / `git.diff` / `git.log`: 抛出标准错误码 `GIT_NOT_REPOSITORY`。
- **空仓库（刚刚 git init，尚无 Commit）**:
  - `git.info`: 返回 `{ isRepository: true, branch: "master", detached: false, head: null, shortHead: null, hasUpstream: false }`。
  - `git.status`: 返回空变更列表或未跟踪文件列表。
  - `git.log`: 捕获 Git 128 退出码，优雅返回 `{ commits: [] }`。

---

## 18. 项目访问权限模式说明

- **通用可用性**: 与 Phase 6 文件修改（仅限 `read-write` 项目）不同，Phase 7 的 4 个 Git RPC 均为**严格只读**操作。
- 因此，无论是处于默认 `read-only` 模式的项目，还是处于 `read-write` 模式的项目，均被允许执行 `git.info`、`git.status`、`git.diff` 与 `git.log`。

---

## 19. 仓库级攻击防御验证

在 `tests/git-attacks.test.ts` 中构造了一个恶意植入攻击向量的真实仓库：
1. `.git/config` 植入恶意 `diff.external` 外部命令。
2. `.git/config` 植入恶意 `diff.custom.textconv` 文本转换脚本。
3. `.git/config` 植入恶意 `core.fsmonitor` 监视器脚本。
4. `.git/config` 植入恶意 `core.hooksPath` 钩子目录。

测试验证表明：由于 LocalBridge 强力注入了命令行覆盖标志与空目录重定向，在执行 status、diff、info、log 时，**没有触发任何一条恶意脚本的执行**，攻击标志物（Marker File）始终未被创建。

---

## 20. 新增错误码清单与含义

在 `@localbridge/protocol` 的 `LocalBridgeErrorCode` 中注册了以下 Phase 7 专属错误码：

| 错误码 | 含义 | HTTP 状态映射 |
|---|---|---|
| `GIT_NOT_AVAILABLE` | 本地宿主机未安装 Git 或 PATH 中未找到 | 500 Internal Server Error |
| `GIT_NOT_REPOSITORY` | 指定的项目目录不是有效的 Git 仓库 | 400 Bad Request |
| `GIT_REPOSITORY_BOUNDARY` | 项目为父 Git 仓库的子目录，触发边界隔离策略拒绝访问 | 403 Forbidden |
| `GIT_UNSAFE_REPOSITORY` | Git 报告检测到可疑的所有权风险 (Dubious Ownership) | 403 Forbidden |
| `GIT_TIMEOUT` | Git 命令执行时间超出设定上限（默认 10s） | 504 Gateway Timeout |
| `GIT_PROCESS_FAILED` | Git 底层进程异常退出或执行失败 | 500 Internal Server Error |
| `GIT_OUTPUT_TOO_LARGE` | Git 标准输出超出 512 KiB 安全缓冲上限 | 413 Payload Too Large |
| `GIT_DIFF_TOO_LARGE` | Git Diff 输出超出 256 KiB 单次传输上限 | 413 Payload Too Large |
| `GIT_PARSE_ERROR` | Git 输出格式解析失败 | 500 Internal Server Error |
| `GIT_SENSITIVE_PATH_BLOCKED` | 尝试对敏感文件（如 `.env`）执行 diff 或 log 被拦截 | 403 Forbidden |
| `GIT_SYMLINK_DIFF_BLOCKED` | 尝试对符号链接执行单文件 diff 被拦截 | 400 Bad Request |
| `GIT_SUBMODULE_NOT_SUPPORTED` | 尝试对 Git 子模块执行 diff 被拦截 | 400 Bad Request |

---

## 21. 自动化测试套件设计与测试覆盖情况

Phase 7 新增了 8 大核心测试套件，全面覆盖安全、边界、解析、攻击与端到端场景：

1. `tests/git-process-security.test.ts` (6 tests): 测试直接进程生成、Shell 防注入、超时强杀、双级缓冲上限、stderr 敏感路径脱敏。
2. `tests/git-boundary.test.ts` (3 tests): 测试仓库根目录严格对齐、子目录 `GIT_REPOSITORY_BOUNDARY` 拦截、非 Git 目录表现。
3. `tests/git-status.test.ts` (3 tests): 测试 Clean 状态、改/增/删/重命名/未跟踪检测、中文与 Emoji 文件名、敏感文件屏蔽与状态标记。
4. `tests/git-diff.test.ts` (6 tests): 测试 unstaged/staged diff、contextLines 参数、单文件 diff、敏感文件阻断、沙箱越界拦截。
5. `tests/git-attacks.test.ts` (1 test): 测试对 `diff.external`、`textconv`、`core.fsmonitor`、`hooksPath` 攻击利用链的绝对免疫。
6. `tests/git-log.test.ts` (4 tests): 测试 Commit 历史解析、limit 截断、文件路径范围限定、中文/Emoji 提交说明、空仓库处理及正文/邮箱隔离。
7. `tests/git-privacy.test.ts` (4 tests): 测试针对全部 4 个 RPC 的序列化 JSON 文本，断言零物理路径、零盘符、零 `.git` 路径泄露。
8. `tests/git-rpc-integration.test.ts` (4 tests): 测试 Server ↔ Runner 之间经由 WebSocket 的完整 JSON-RPC 2.0 端到端通信链路。

### 全量测试汇总
- **测试文件总数**: 41 个（全量 Monorepo）
- **测试用例总数**: 304 个
- **执行结果**: 304 passed, 0 failed, 0 skipped
- **耗时**: ~20 秒

---

## 22. Monorepo 构建、类型检查与运行时验证

- **Runtime**:
  - Node.js: `v24.21.0`
  - pnpm: `10.14.0`
  - OS: Windows 11 x64
- **TypeScript Typecheck**:
  - `pnpm typecheck` 执行于 5 个工作区项目（protocol, security, shared, runner, server），0 errors，0 warnings。
- **Monorepo Build**:
  - `pnpm build` 执行于 protocol, security, shared, server, runner，全量 ESM 打包与 `.d.ts` 声明文件生成 100% 成功。
- **版本对齐**:
  - 核心组件版本全部统一升至 `0.7.0`（`apps/runner/package.json`、`apps/server/package.json`、`apps/server/src/app.ts`、`apps/runner/src/runner.ts`）。

---

## 23. 后续 Phase 演进说明

- **Phase 8 (Safe Code Search & Symbol Discovery)**:
  - 在 Phase 4~7 基础上，为 LocalBridge 引入基于 ripgrep/内存正则的安全代码搜索与轻量级 AST 符号探测（`search.text`、`search.files`、`code.symbols`）。
- **Phase 9 (MCP Protocol Runtime & Streamable HTTP)**:
  - 接入 `@modelcontextprotocol/server`，基于 `MCP 2026-07-28` 规范，实现面向 AI 客户端的 `POST /mcp` Streamable HTTP 端点，将底层的 Runner RPC 桥接为标准的 MCP Tools。
