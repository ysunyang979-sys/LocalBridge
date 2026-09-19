# LocalBridge

> 面向本地开发项目的安全模型上下文协议（Model Context Protocol, MCP）桥接系统。

LocalBridge 允许 ChatGPT、Claude、Codex 等支持 MCP 的 AI 助手，在严格权限受控的前提下，安全地访问、搜索、修改、构建和测试用户本地电脑上的项目，而无需将整机磁盘暴露给 AI，也无需将源码上传给不可信的第三方。

---

## 总体架构设计

LocalBridge 严格遵循 Server 与 Runner 权限分离原则：

```text
AI Client (ChatGPT / Claude / Codex)
        │
        │ MCP 2026-07-28 Streamable HTTP (POST /mcp, Bearer lb_xxx)
        ▼
LocalBridge Server (Node.js + Fastify)
        │
        │ LocalBridge RPC (JSON-RPC 2.0 over WebSocket, Auth lbr_xxx)
        ▼
LocalBridge Runner (用户本地驻留 Node.js 守护进程)
        │
        ├── Filesystem (沙箱限制、Canonical Path 严格校验)
        ├── Git CLI
        ├── Shell (命令风险引擎识别、超时熔断)
        ├── Build & Test 执行引擎
        └── 长时间后台任务 (Jobs)
        │
        ▼
用户授权项目目录 (例如 D:\Projects\my-app)
```

### 核心安全保障
- **服务端无权直读磁盘**：Server 绝不直接读取项目物理文件，仅作为协议中继与授权分发枢纽；Runner 主动向 Server 发起安全 WebSocket 连接。
- **项目沙箱与规范路径校验**：AI 仅能感知抽象的 `project_id`。所有文件访问在执行前均经过真实规范路径（Canonical Path）校验，彻底防御 `../` 路径穿越、符号链接越权（Symlink Escape）、Windows Junction 逃逸及 UNC 路径。
- **双 Token 体系绝对隔离**：MCP 客户端 Token（`lb_` 前缀）与 Runner 认证 Token（`lbr_` 前缀）均基于 256-bit 高熵随机数（`crypto.randomBytes(32)`）生成，数据库仅存储 SHA-256 哈希值（`token_hash`），明文 Token 仅在创建时返回一次，绝不落地。固定长度 SHA-256 摘要配合 crypto.timingSafeEqual，降低 Token 比较阶段的时序侧信道风险。
- **命令风险防护引擎**：Shell 命令严格划分为 `SAFE`、`CAUTION`、`DANGEROUS` 三级，高危命令（如 `rm -rf /`、`format`、`reg delete`、`DROP DATABASE` 等）默认无条件拦截。
- **敏感文件拦截屏障**：默认严密拦截 `.env*`、`*.pem`、`*.key`、`id_rsa` 等机密配置文件，除非用户在项目中明确放行。

---

### 代码仓库结构 (Monorepo)

本代码仓库基于 `pnpm` 工作区组织，包含 **6 个工作区包/应用** 以及 **1 个根工作区**（共 **7 个工作区成员**）：

```text
localbridge/
├── apps/
│   ├── desktop/          # Tauri 2 + React + Vite 桌面控制中心
│   ├── runner/           # 本地执行守护进程（文件系统、Git、命令与长作业）
│   └── server/           # Fastify 服务端（MCP 端点、REST API、SQLite 状态存储）
├── packages/
│   ├── protocol/         # 纯协议定义层、JSON-RPC 2.0 模式、统一错误码
│   ├── security/         # 路径逃逸检测、命令风险评估引擎接口
│   └── shared/           # Pino 结构化日志、多级配置加载器、加密工具
├── tests/                # 单元测试与端到端测试套件（75 套件，450 测试）
├── docs/                 # 详细架构与协议设计规范
└── scripts/              # 构建与辅助脚本
```

---

## 快速上手 (LocalBridge v1.0)

LocalBridge 既可作为预打包的独立桌面应用（Tauri 安装包）运行，也可直接从源码启动。

### 5 步极简使用指南

#### 第一步：安装或启动 LocalBridge
- **安装包（推荐）**：下载并运行 `LocalBridge-Setup-1.0.0.exe` 或 `.msi` 安装向导。
- **源码启动**：
  ```powershell
  # 克隆并编译
  pnpm install
  pnpm build
  
  # 启动桌面控制中心
  pnpm --filter @localbridge/desktop dev
  ```

#### 第二步：打开桌面控制中心
启动 LocalBridge 桌面程序。系统托盘常驻图标显示绿色，指示本地服务端（`127.0.0.1:18080`）与执行 Runner 守护进程已自动连接就绪。

#### 第三步：授权本地项目目录
1. 在桌面控制中心切换到 **项目 (Projects)** 标签页。
2. 点击 **添加项目 (Authorize Project)**，使用系统原生目录选择器选取本地项目目录（如 `D:\Projects\my-app`）。
3. 选择 **访问模式 (Access Mode)**（`只读` 或 `读写`）及 **执行模式 (Execution Mode)**（`禁用执行`、`仅安全工具` 或 `允许项目脚本`）。

#### 第四步：创建 MCP 客户端 Token
1. 进入 **令牌 (Tokens)** 标签页。
2. 点击 **生成令牌 (Generate Token)**，类型选择 `MCP Client Token`（以 `lb_` 为前缀），填写用途备注（例如 `Claude Desktop`）。
3. 复制生成的 256 位高熵 Token。*（注意：明文仅展示一次，数据库绝不持久化明文）*。

#### 第五步：接入 AI 客户端
在你的 AI 桌面应用配置文件中（例如 Claude Desktop 的 `claude_desktop_config.json` 或 Cursor MCP 设置），添加 LocalBridge 端点：

```json
{
  "mcpServers": {
    "localbridge": {
      "url": "http://127.0.0.1:18080/mcp",
      "headers": {
        "Authorization": "Bearer lb_你的令牌内容",
        "MCP-Protocol-Version": "2026-07-28"
      }
    }
  }
}
```

现在你的 AI 助手即可在受限项目边界内，安全调用全部 23 个官方 MCP 工具！

---

## 开发者与 CLI 运维操作

针对无桌面环境或服务端集成测试：

```bash
# 执行类型检查
pnpm typecheck

# 运行全套 75 个测试套件（450 个自动化测试，100% 通过）
pnpm test

# 独立启动服务端
pnpm --filter @localbridge/server dev

# 独立启动 Runner 守护进程
pnpm --filter @localbridge/runner dev
```

或通过命令行参数直接传递：
```bash
pnpm --filter @localbridge/runner dev --token lbr_xxxxxxxxxxxxxxxxx --name "My PC"
```

### 4. 验证连接状态

查询 Server 状态及已连接的 Runner 客户端：

```bash
# 查询服务端状态（已连接时 runners_connected = 1）
curl http://127.0.0.1:18080/api/status

# 列出当前在线的 Runner
curl http://127.0.0.1:18080/api/runners
```

### 5. Server ↔ Runner RPC 调用链路 (Phase 3)

LocalBridge 在 Server 与已连入的 Runner 之间建立了强类型的双向 JSON-RPC 2.0 通信链路：

#### 核心方法与调试端点
- `system.ping`：应用层端到端连通性往返校验。
  ```bash
  curl -X POST http://127.0.0.1:18080/api/runners/<runner_id>/ping
  # {"pong": true, "timestamp": 1742250000000, "runnerId": "..."}
  ```
- `system.info`：实时查询 Runner 环境与工具链版本（自动脱敏敏感环境变量与路径）。
  ```bash
  curl http://127.0.0.1:18080/api/runners/<runner_id>/system-info
  ```

#### 请求生命周期与可靠性保证
- **关联 ID 唯一性**：请求全局使用高强度密码学随机 ID `req_<UUID>`，拒绝简单自增 ID。
- **端到端双向类型约束**：基于 `RunnerRpcMap` 与 Zod Schema，服务端发送前/接收后以及 Runner 端接收后均执行强类型校验。
- **并发与消息大小防护**：单个 Runner 连接并发 RPC 挂起上限限制为 `MAX_PENDING_REQUESTS = 64`，单条消息上限 `MAX_RPC_MESSAGE_SIZE = 1 MiB`。
- **严格超时与内存防泄漏**：每个请求独立挂载超时熔断（`system.ping` 为 5 秒，`system.info` 为 10 秒），超时自动清除挂起状态并抛出 `RPC_TIMEOUT`。
- **网络中断立即回收**：Runner 意外断开时，所有未完成请求立即清理定时器并以 `RUNNER_DISCONNECTED` 失败响应，杜绝 Promise 挂死。
- **标准错误处理**：标准 JSON-RPC 错误码（`-32700`、`-32600`、`-32601`、`-32602`、`-32603`），绝不向远端泄露本地调用栈或环境机密。

### 6. 本地项目授权与路径沙箱 (Phase 4)

LocalBridge Phase 4 建立了不可逾越的本地授权安全边界与高强度多层路径沙箱。

#### 核心原则：零远端授权 (Zero Remote Authorization)
远端 AI 模型、外部 MCP Client 以及 LocalBridge Server 本身，**绝对无法**指定或修改 Runner 机器上的本地文件目录。只有物理位于 Runner 机器上的合法用户，才能通过本地 Runner CLI 显式授权目录。物理真实路径（`root`、`canonicalRoot`、`absolutePath`）**绝不离开** Runner 宿主机，绝不会在网络中传输，更不会持久化到服务端数据库。

#### Runner 本地项目 CLI 指令
在运行 Runner 守护进程的本地设备终端中执行：

```bash
# 显式授权本地真实目录（生成持久稳定的 UUIDv4 标识符 proj_xxx）
pnpm --filter @localbridge/runner project:add /path/to/my-project --name "My Project"

# 列出本地已授权的所有项目及其真实物理规范根目录
pnpm --filter @localbridge/runner project:list

# 临时禁用某个项目（保持授权记录但不允许任何访问）
pnpm --filter @localbridge/runner project:disable <project_id>

# 重新启用项目
pnpm --filter @localbridge/runner project:enable <project_id>

# 彻底移除项目的本地授权
pnpm --filter @localbridge/runner project:remove <project_id>
```

#### 多层纵深路径沙箱防护模型
所有针对项目的相对路径操作请求均在 `@localbridge/security` 中经过严格的沙箱防御校验：
1. **词法安全校验 (Lexical Analysis)**：拦截各种形式的目录穿越（`../`、`..\`、混合分隔符 `a/b/../../..`）、绝对路径（如 `C:\Windows` 或 `/etc/passwd`）、盘符相对路径（`C:foo`）以及根相对路径（`/foo`、`\foo`）。
2. **Windows 平台特化防御**：
   - 严禁 UNC 网络路径（`\\server\share`）。
   - 严禁 NT 设备命名空间（`\\?\` 与 `\\.\`）。
   - 严禁 NTFS 备用数据流（ADS 冒号注入，如 `file.txt:stream`）。
   - 严禁 DOS 保留设备名（`CON`、`PRN`、`AUX`、`NUL`、`COM1`~`COM9`、`LPT1`~`LPT9`）。
   - 严禁路径片段尾随点或空格（如 `foo.txt.` 或 `foo.txt `，防止 Windows 自动脱点导致安全策略绕过）。
   - 严禁空字节注入（`\0`）。
3. **物理规范包含性检查 (Canonical Containment)**：基于操作系统底层的 `fs.realpathSync.native` 获取物理真实路径，并严格使用 `path.relative()` 计算相对距离，防止前缀混淆攻击（例如 `C:\Project` 与 `C:\Project-Evil`）。
4. **软链接与 Windows 目录联接穿越防御 (Symlink & Junction Escape Protection)**：检测并拦截指向项目根目录外部的软链接及 Windows Directory Junction，抛出 `PATH_SYMLINK_ESCAPE`。
5. **敏感凭证屏蔽策略 (Sensitive File Shield)**：默认主动阻断高危凭证与私钥的探测与访问（包含 `.env`、`.env.*`、`*.pem`、`*.key`、`id_rsa*`、`id_ed25519*`、`.ssh/*`、`.aws/*`、`.git/*`、`credentials.json`、`client_secret*.json` 等）。

### 7. 安全只读文件系统与目录浏览 (Phase 5)

LocalBridge Phase 5 通过 Server ↔ Runner 强类型 RPC，在用户授权的项目边界内提供了严格受限的只读文件系统探测与 UTF-8 文本切片浏览能力（`directory.list`、`file.stat`、`file.read`）。

### 8. 安全文件修改与事务式写操作 (Phase 6)

LocalBridge Phase 6 通过 Server ↔ Runner JSON-RPC 2.0，为已授权项目引入具备冲突检测、原子操作、可审计与隔离备份的安全文件修改引擎。

#### 事务式修改 RPC 方法
1. **`file.create`**：
   - 在已授权项目的沙箱内创建新的 UTF-8 文本文件。
   - **禁止隐式创建目录**：目标父目录必须真实存在，否则抛出 `PARENT_DIRECTORY_NOT_FOUND`（严禁静默执行 `mkdir -p`）。
   - **非存在性强制核验**：若目标文件或符号链接已存在，立即抛出 `FILE_ALREADY_EXISTS`。
   - **安全阈值**：严禁含有空字节（NUL byte）的二进制内容（`BINARY_FILE`），文件大小上限为 8 MiB（`FILE_TOO_LARGE`）。
   - 返回 `{ operationId, projectId, path, newHash, bytes }`。

2. **`file.write`**：
   - 覆盖现有文件，强制要求传入当前文件 SHA-256 校验摘要（`expectedHash`）。
   - **强冲突检测**：比较当前物理文件内容的 SHA-256 与 `expectedHash`，若发生偏离立即抛出 `FILE_CONFLICT` 并终止。
   - **写入前自动化备份**：在覆盖前自动将原内容及元数据隔离归档至 Runner 状态目录（`metadata.json` 与 `content`）。
   - **原子同级临时文件替换**：向同级路径写入 `.${basename}.localbridge-<id>.tmp`，执行 `fsync` 确保落盘，继承原文件权限属性，并通过原子 `fs.renameSync` 替换。写入失败自动清理临时文件。
   - 返回 `{ operationId, projectId, path, oldHash, newHash, bytesBefore, bytesAfter, backupCreated: true }`。

3. **`file.patch`**：
   - 内存流式顺序 Search/Replace 补丁引擎，支持原子全量或全不回滚。
   - **严格单匹配校验**：每个查找块在文本中必须且仅能匹配一次。若匹配 0 次抛出 `PATCH_NOT_FOUND`；若匹配超过 1 次抛出 `PATCH_AMBIGUOUS`。
   - **补丁前冲突校验**：在计算补丁前校验 `expectedHash`。
   - **自动化备份与原子写入**：修改前完成快照备份，通过原子临时文件安全替换。
   - 返回 `{ operationId, projectId, path, oldHash, newHash, bytesBefore, bytesAfter, replacementsApplied }`。

4. **`file.delete`**：
   - 安全删除指定文件，强制校验 `expectedHash` 防范并发冲突。
   - **隔离归档备份**：删除前将原内容与元数据移入 Runner 隔离备份区，支持完整的撤销与恢复。
   - 返回 `{ operationId, projectId, path, oldHash, deleted: true, backupCreated: true }`。

5. **`file.restore`**：
   - 根据指定的 `operationId` 将文件精准恢复至修改或删除前的历史状态。
   - **恢复防并发冲突**：若文件在对应操作后又被并发修改，立即抛出 `RESTORE_CONFLICT` 拒绝盲目回滚覆盖。
   - 支持从隔离区将已删除的文件按原属性与权限恢复至磁盘。
   - 返回 `{ operationId, projectId, path, restoredHash, bytesRestored }`。

#### 项目访问权限模型 (Access Mode Boundary)
- 所有项目的默认授权模式严格为 `accessMode: "read-only"`。
- 远端 AI 客户端与 Server **严禁**擅自提升项目权限（不存在任何远端 `project.setAccess` RPC）。
- 项目访问权限变更必须由用户在本地通过 Runner CLI 手动触发：
  ```bash
  pnpm --filter @localbridge/runner project:set-access <project-id> <read-only|read-write>
  ```
- 任何在只读模式项目上尝试的写操作（create / write / patch / delete / restore）均会被立即拒绝并抛出 `PROJECT_READ_ONLY`。

#### 物理隔离备份子系统 (Isolated Backup Subsystem)
- 备份统一存储在 Runner 本地守护进程的状态目录中（`<runnerStateDir>/backups/<projectId>/<operationId>/`），**绝不**写入用户项目代码树内部。
- 保留策略：单项目最多保留 100 个历史备份且最大占用不超过 100 MiB，超出阈值自动执行先进先出（FIFO）淘汰。

#### 核心安全与隐私承诺
- **物理路径零泄露**：物理真实绝对路径（`root`、`canonicalRoot`、`absolutePath`）仅停留在 Runner 内存中，绝不出现在任何 RPC 返回中。
- **服务端零文件持久化**：Server 仅作为无状态 RPC 协议转发器，绝不存储任何源代码内容、补丁片段或备份实体。
- **操作安全边界**：严禁目录变更（`directory.create`、`directory.delete`）、严禁文件重命名或移动（`file.move`、`file.rename`）、严禁修改符号链接（`FILE_SYMLINK_WRITE_BLOCKED`），Shell 执行与 MCP 端点依然严格处于禁用状态。

### 9. 安全只读 Git 仓库检查与差异引擎 (Phase 7)

LocalBridge Phase 7 通过 Server ↔ Runner 强类型 RPC，为已授权项目引入严格受控、只读的 Git 仓库状态检查与 Unified Diff 差异比对能力。

#### 只读 Git RPC 方法
1. **`git.info`**：
   - 获取 Git 仓库核心元数据：当前分支名称、是否处于 Detached HEAD 状态、完整 HEAD Commit OID、7 位短 Hash (`shortHead`) 以及是否存在远端上游追踪。
   - 返回 `{ projectId, isRepository, branch, detached, head, shortHead, hasUpstream }`。
   - 对非 Git 项目安全返回 `{ isRepository: false, ... }`，不抛出异常。

2. **`git.status`**：
   - 基于空字符（NUL byte）分隔的 Git Porcelain v2 格式解析工作区与暂存区状态（`git status --porcelain=v2 --branch -uall -z`）。
   - 全面检测新增、修改、删除、重命名（包含 `oldPath` 追溯）与未跟踪文件。
   - 精准统计相比远程上游的超前/落后提交数（`ahead` / `behind`）。
   - **隐私屏蔽屏障**：自动过滤敏感文件（如 `.env`、`*.pem`、`id_rsa` 等），并标记 `sensitiveEntriesFiltered: true`。
   - **条目上限截断**：严格限制返回至多 500 个变更条目，超出时设置 `truncated: true`。
   - 返回 `{ projectId, branch, detached, ahead, behind, clean, entries, sensitiveEntriesFiltered, truncated }`。

3. **`git.diff`**：
   - 支持全项目范围或针对单个指定文件的 Unified Diff 差异对比。
   - 支持 `scope: "unstaged"`（工作区 vs 暂存区）与 `scope: "staged"`（暂存区 vs HEAD 提交）。
   - 支持动态配置上下文行数参数（`contextLines: 0~20`，默认 3）。
   - **仓库级命令注入防御**：强制注入 `--no-ext-diff`、`--no-textconv`、`-c diff.external=`、`-c core.fsmonitor=false` 以及独立隔离的空 Hooks 目录，彻底粉碎基于 `.git/config` 或 `.gitattributes` 的外部命令执行利用链。
   - **符号链接与子模块防御**：项目级 diff 自动过滤符号链接，单文件 diff 显式阻断符号链接（`GIT_SYMLINK_DIFF_BLOCKED`）与 Git 子模块（`GIT_SUBMODULE_NOT_SUPPORTED`）。
   - **输出体积极限保护**：Diff 输出严格限制在 256 KiB 以内，超大 Diff 主动抛出 `GIT_DIFF_TOO_LARGE` 终止。
   - 返回 `{ projectId, scope, files, diff, sensitiveEntriesFiltered, symlinkEntriesFiltered, submoduleEntriesFiltered }`。

4. **`git.log`**：
   - 基于自定义 NUL 分隔格式（`%H%x00%h%x00%an%x00%at%x00%s`）获取最近提交记录。
   - 提取 Commit 完整 Hash、短 Hash、作者昵称、毫秒级时间戳以及提交说明主题。
   - 支持获取条数限制（`limit: 1~100`，默认 20）以及路径范围限定（`path: "sub/file.ts"`）。
   - **隐私保护边界**：严格剔除作者电子邮箱（`%ae`）、Commit 详细正文（`%b`）以及远端服务器地址。
   - 返回 `{ projectId, commits }`。

#### 仓库边界与进程加固策略
- **仓库根边界对齐 (Repository Root Containment)**：Git 工作区根目录必须严格等同于项目物理规范路径（`git rev-parse --show-toplevel === canonicalRoot`）。严禁对父级仓库的子目录执行 Git 命令，越界直接抛出 `GIT_REPOSITORY_BOUNDARY`。
- **直接进程执行 (No Shell)**：通过 `child_process.spawn("git", ...)` 直接执行二进制文件，禁用 Shell 解析（`shell: false`），消除 Shell 参数注入隐患。
- **超时与缓冲区硬限制**：默认单次命令执行超时为 10 秒（上限 30 秒），标准输出缓冲区限制为 512 KiB。
- **通用权限可用性**：处于 `read-only` 和 `read-write` 访问模式的已授权项目均可安全执行只读 Git 检查。
- **物理路径零泄露**：统一脱敏错误信息与 Diff 输出中的物理路径、盘符与操作系统用户目录。

> [!IMPORTANT]
> **Phase 7 状态声明**：LocalBridge 已完成 Phase 7（安全只读 Git 仓库检查与差异引擎）。

### 10. 受控命令执行与命令风险引擎 (Phase 8)

LocalBridge Phase 8 引入了强类型、风险分类、经用户授权的受控子进程执行能力（通过 Server ↔ Runner JSON-RPC 2.0 运行）。该机制彻底杜绝了任意 Raw Shell 执行，用严格受限沙箱进程执行引擎取而代之。

#### 严禁执行的操作（零 Raw Shell）
- **禁止 Raw Shell 执行**：严禁提供 `shell.run("任意字符串")`、`cmd.exe /c`、`powershell -Command`、`bash -c` 或 `sh -c`。
- **禁止远端传入任意可执行文件**：远端调用方（AI 或 Server）无法指定任意系统命令或可执行程序路径（如 `{ "executable": "...", "args": [...] }`）。
- **禁止破坏性/依赖变更包管理器命令**：如 `npm install`、`pnpm add`、`npm update` 以及包生命周期脚本（`preinstall`、`install`、`postinstall`、`prepare`、`prepack`、`postpack`）均被分类为 `DANGEROUS` 并无条件阻断。
- **禁止内联代码动态求值参数**：如 `node -e`、`node --eval`、`python -c` 均被归类为 `DANGEROUS` 并无条件拦截。

#### 项目执行权限模式 (executionMode)
每个已授权项目具有独立的 `executionMode` 属性：
- **`disabled`**（默认）：禁止执行任何形式的命令。
- **`safe-only`**：仅允许执行无害的系统工具版本探测（`tool-version`）。禁止运行任何脚本或包管理器。
- **`project-code`**：允许运行安全工具版本检查、项目内部脚本（`node-script`、`python-script`）以及在 `package.json` 中明确定义的包脚本（`package-script`）。**严格要求该项目处于 `accessMode: "read-write"` 模式**。

#### 仅限本地管理员控制
- 远端调用方（AI 或 Server）**绝无权限**修改 `executionMode`。
- 权限模式仅能由本地用户在 Runner 主机上通过 CLI 设置：
  ```bash
  pnpm --filter @localbridge/runner project:set-execution <project-id> <disabled|safe-only|project-code>
  ```
- **自动降级保护**：当项目的 `accessMode` 被降级为 `read-only` 时，其 `executionMode` 会立即被自动降级为 `disabled`。

#### 结构化命令规范 (CommandSpec)
所有执行请求必须遵循类型化的结构化联合类型：
1. **`tool-version`**：
   - 检查 Runner 主机上安装的开发工具版本（`node`、`npm`、`pnpm`、`python`）。
   - 仅附加 `--version` 参数执行。风险等级为 `SAFE`。
2. **`node-script`**：
   - 执行已在项目沙箱内经过验证的 `.js`、`.mjs` 或 `.cjs` 脚本。
   - 验证脚本为普通文件（拒绝符号链接），且不在敏感目录内。风险等级为 `CAUTION`。
3. **`python-script`**：
   - 执行已在项目沙箱内经过验证的 `.py` 脚本。
   - 验证脚本非符号链接且不在敏感路径。风险等级为 `CAUTION`。
4. **`package-script`**：
   - 执行 `package.json` 中显式定义的 scripts（`scripts[name]`），支持 `npm` 或 `pnpm`。
   - 执行前必须校验脚本确实存在于配置中。风险等级为 `CAUTION`。

#### 子进程隔离与环境变量安全加固
- **直接进程派发 (Direct Spawning)**：通过 `child_process.spawn(executablePath, args, { shell: false })` 直接派发。在 Windows 平台上，`npm` 和 `pnpm` 直接通过 `node.exe` 配合入口 JS 脚本派发，彻底避开 `cmd.exe`，免受 Node 24 `.cmd` 派发漏洞（CVE-2024-27980）影响。
- **环境变量最小白名单**：子进程不继承父进程环境变量。仅透传最小安全系统变量（Windows: `PATH`, `SystemRoot`, `WINDIR`, `TEMP`, `TMP`, `COMSPEC`；POSIX: `PATH`, `LANG`, `LC_ALL`, `TMPDIR`）。
- **父级凭据彻底剔除**：强制剔除所有 API 密钥与凭据（`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`AWS_*`、`GITHUB_TOKEN`、Runner 鉴权令牌等）。
- **用户家目录独立沙箱**：将 `HOME`、`USERPROFILE`、`XDG_CONFIG_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME` 以及 `NPM_CONFIG_USERCONFIG` 统一重定向到 Runner 内部独立的 `<runnerStateDir>/execution-home/` 隔离目录。
- **Python 环境隔离**：设置 `PYTHONNOUSERSITE=1`，防止 Python 脚本载入全局用户 site-packages。

#### 资源上限与进程树终止
- **输出体积分级限制**：标准输出限额 256 KiB，标准错误限额 256 KiB，合并总输出上限 512 KiB。超出立即杀死整个进程树，并抛出 `COMMAND_OUTPUT_TOO_LARGE`。
- **执行超时保护**：默认 60 秒（有效区间 1s~300s）。超时立即强制终止整个子进程树，并抛出 `COMMAND_TIMEOUT`。
- **进程树级终止 (Process Tree Kill)**：在 Windows 上调用 `taskkill.exe /PID <pid> /T /F`，确保孙子进程（如 npm 派生的 node 进程）同步终止；在 POSIX 上向进程组发送 SIGKILL。
- **输出脱敏处理**：清洗所有 ANSI 转义序列、CSI 控制字符与 OSC 超链接，同时完整保留 UTF-8 编码、中文字符及 Emoji。将物理路径自动替换为 `<project-root>`、`<runner-state>` 与 `<user-home>` 占位符。
- **Server 端零输出持久化**：Server 仅在 SQLite 审计表中记录执行元数据（执行耗时、退出码、参数等），绝不持久化 stdout/stderr 内容。

#### 信任边界免责声明
> [!WARNING]
> **项目代码信任边界声明**：在 `project-code` 模式下运行的命令具有 Runner 进程宿主操作系统的同等用户权限。LocalBridge 提供了极其严苛的参数校验、路径限制、环境净化、缓冲区上限与超时终止机制，但并不提供操作系统内核级容器沙箱或虚拟机级物理隔离。用户必须仅对完全信任的代码与依赖项启用 `project-code` 模式。

> [!IMPORTANT]
> **Phase 8 状态声明**：LocalBridge 已完成 Phase 8（受控命令执行与风险分级）。

### 11. 构建/测试与后台任务系统 (Phase 9)

LocalBridge Phase 9 引入了面向长时间运行的构建、测试及项目脚本的异步后台任务子系统（`job.start`、`job.status`、`job.logs`、`job.cancel`、`job.list`、`build.start`、`test.start`），并通过 JSON-RPC 2.0 提供完整的生命周期管理。

#### 零原生 Shell 保证与统一安全模型
- **严格禁止**：严禁执行任何任意 Shell（`shell.run`、`cmd.exe /c`、`powershell -Command`、`bash -c`、`sh -c`），严禁任意可执行文件路径及自由命令字符串。
- **沿用 Phase 8 策略**：所有后台任务均必须通过 Phase 8 严格定义的结构化 `CommandSpec` 与安全策略引擎派发。
- **权限限制**：仅当项目被显式赋予 `executionMode: "project-code"` 且处于 `accessMode: "read-write"` 模式时，才允许运行后台脚本与构建/测试任务。

#### 高层级 `build.start` 与 `test.start` 封装
- 专为项目构建与测试提供的类型化高层 RPC 接口：
  - `build.start`：默认执行 `pnpm run build` 或 `npm run build`（或指定的自定义构建脚本）。
  - `test.start`：默认执行 `pnpm run test` 或 `npm run test`（或指定的自定义测试脚本）。
- 执行前严格校验项目根目录下是否存在 `package.json` 并包含所请求的 script；若缺失则直接抛出 `BUILD_SCRIPT_NOT_FOUND` 或 `TEST_SCRIPT_NOT_FOUND`，拒绝生成进程。
- **绝不自动安装依赖**：缺失 `node_modules` 将作为常规构建失败如实记录在日志中；LocalBridge 严禁自动执行 `npm install` 或 `pnpm install`。

#### 并发容量与速率限制
- **Runner 级并发限制**：整个 Runner 守护进程全局最多允许 4 个并行运行的任务（`MAX_RUNNING_JOBS_PER_RUNNER = 4`）。超出时抛出 `JOB_CAPACITY_EXCEEDED`。
- **项目级并发限制**：单个已授权项目最多允许 2 个并行运行的任务（`MAX_RUNNING_JOBS_PER_PROJECT = 2`）。超出时抛出 `JOB_CAPACITY_EXCEEDED`。
- **启动速率限制**：每分钟最多允许发起 20 次任务启动（`MAX_JOB_STARTS_PER_MINUTE = 20`）。超出时抛出 `JOB_RATE_LIMITED`。
- 任务一旦结束（成功、失败、取消、超时），占用的配额容量将立即自动释放。

#### 执行边界与进程树级终止
- **超时保护**：支持为任务配置 1 秒 ~ 3600 秒（默认 600 秒 / 10 分钟）的执行时限。超时触发后，在 Windows 上调用 `taskkill.exe /PID <pid> /T /F`，在 POSIX 上向进程组发送信号，彻底杀死整棵子进程树，任务状态转换为 `timed-out`。
- **优先级**：任务级 `timeoutMs` 优先于 `CommandSpec.timeoutMs`，避免产生双重定时器冲突。
- **幂等取消**：调用 `job.cancel` 立即终止正在运行的进程树；若任务已处于终态，则安全返回 `alreadyTerminal: true`。

#### 内存环形缓冲区与日志流式脱敏
- **4 MiB 内存环形缓冲区**：每个任务在内存中维护最多 4 MiB 的日志缓冲，超额时按 FIFO 规则自动淘汰最旧数据块，并精确统计 `truncated: true` 与 `droppedBytes`。
- **入库前脱敏**：ANSI 颜色码、CSI 控制符及 OSC 超链接在存入缓冲区前即被剔除；敏感物理路径统一重命名为 `<project-root>`、`<runner-state>` 与 `<user-home>` 占位符，同时完整保留 UTF-8 编码、中文字符及 Emoji。
- **基于游标的分页拉取**：`job.logs` 支持通过 base64url 游标（`lastSeq`）进行无缝连续拉取，单次 RPC 响应严格限制在最多 100 个 chunk 及 128 KiB 文本之内。
- **Server 端零日志持久化**：Server 仅在 SQLite 中审计任务元数据，绝不持久化 stdout/stderr 日志。

#### Runner 本地所有权与断网连续性
- 后台任务的所有权属于本地 Runner 守护进程，而非临时的 WebSocket 连接。
- 若网络抖动或 WebSocket 意外中断，本地正在运行的任务不受任何影响，继续在本地后台执行。
- 重新连接后，调用方可凭唯一的 `job_<UUIDv4>` ID 查询任务最新状态并增量拉取完整日志。

#### 权限变更即时中断 (Revocation Abort)
- 一旦用户在 ProjectRegistry 中移除项目、禁用项目，或者将项目降级为 `disabled`/`safe-only` 或 `read-only`，Runner 将即时感知并强制杀死该项目名下所有正在运行的后台任务。

#### 信任边界免责声明
> [!WARNING]
> **后台任务信任边界声明**：后台任务具有 Runner 进程宿主操作系统的同等用户权限。LocalBridge 提供了极其严苛的参数校验、路径限制、环境净化、缓冲区上限与超时终止机制，但并不提供操作系统内核级容器沙箱或虚拟机级物理隔离。用户必须仅对完全信任的代码与依赖项启用 `project-code` 模式。

> [!IMPORTANT]
> **Phase 11 状态声明**：LocalBridge 已完成 Phase 11。桌面管理控制中心（`apps/desktop`）、本地环回管理通道、人工审批系统（Human-in-the-Loop Approval）与紧急熔断控制均已全面就绪。

### 12. MCP 2026-07-28 服务端与 AI 客户端集成 (Phase 10)

LocalBridge Phase 10 通过官方 Model Context Protocol (MCP) 规范版本 `"2026-07-28"`（基于 Streamable HTTP `POST /mcp`），向外部 AI 助手（如 ChatGPT、Claude、Codex 等）提供 23 个安全、类型化且仅限用户授权范围的工具能力。

#### 协议合规性与无状态传输
- **接入端点**：`POST /mcp`
- **协议版本**：严格锁定为 `"2026-07-28"`。可通过请求头 `MCP-Protocol-Version: 2026-07-28` 或消息体自动协定版本。
- **纯无状态架构 (Stateless)**：零会话存储，不依赖 `Mcp-Session-Id`。每个 HTTP POST 请求均独立完成鉴权并由一次性隔离的 MCP Server/Transport 实例处理，请求结束后立即清理。
- **请求头审计**：
  - `Authorization: Bearer lb_...`：必需的 MCP 客户端 Bearer 令牌。
  - `Mcp-Method`：若提供，必须严格与请求体中的 JSON-RPC 方法（如 `tools/list`、`tools/call`）匹配。
  - `Mcp-Name`：若在 `tools/call` 请求中提供，必须严格与 `params.name` 保持一致。
- **诊断端点**：仅允许本地环回访问的 `GET /api/mcp/status` 返回 MCP 运行状态元数据（`{ mcpActive: true, version: "0.11.0", protocolVersion: "2026-07-28", toolsCount: 23 }`）。

#### 23 个安全官方 MCP 工具列表
LocalBridge 严格向 MCP 暴露且仅暴露 23 个审计工具：

| 领域分类 | 工具名称 | 职责描述 |
|---|---|---|
| **项目发现** | `localbridge_project_list`<br>`localbridge_project_info` | 查询所有已授权项目的 ID 与元数据（访问权限、执行权限）。 |
| **文件只读** | `localbridge_directory_list`<br>`localbridge_file_stat`<br>`localbridge_file_read` | 目录树浏览、元数据查询与带内容哈希校验的行级读取。 |
| **文件事务写入** | `localbridge_file_create`<br>`localbridge_file_write`<br>`localbridge_file_patch`<br>`localbridge_file_delete`<br>`localbridge_file_restore` | 乐观哈希锁控制的原子式文件创建、覆盖、补丁、删除与历史备份回滚。 |
| **Git 检查** | `localbridge_git_info`<br>`localbridge_git_status`<br>`localbridge_git_diff`<br>`localbridge_git_log` | 安全沙箱内的只读 Git 工作区状态、统一差分与提交日志。 |
| **命令与任务** | `localbridge_command_classify`<br>`localbridge_command_run`<br>`localbridge_job_start`<br>`localbridge_job_status`<br>`localbridge_job_logs`<br>`localbridge_job_cancel`<br>`localbridge_job_list`<br>`localbridge_build_start`<br>`localbridge_test_start` | 受控脚本运行、构建/测试任务启动、状态监控与分页日志拉取。 |

#### 禁止暴露的工具与攻击面收敛
MCP 端点严格排除了以下高危能力：
- 严禁任何原生 Shell 或自由命令执行工具（`shell_run`、`cmd_run`、`exec`、`bash` 等）。
- 严禁任何配置管理或 Token 签发撤销工具（`token_create`、`token_revoke`、`project_authorize` 等）。
- 严禁直接内部 RPC 通道或内部状态探测工具（`system.ping`、`rpc.call`、`runner.request` 等）。
- 物理主机路径零泄漏：所有返回结果与错误信息均使用虚拟项目相对路径或 `<project-root>` 占位符。

#### 安全加固与隔离保障
- **跨 Token 隔离 (Cross-Token Isolation)**：Runner 令牌（`lbr_` 前缀）访问 `/mcp` 端点将直接以 401 `INVALID_TOKEN_TYPE` 拦截；MCP 客户端令牌（`lb_` 前缀）访问 `/runner/ws` 将以 403 `INVALID_TOKEN_TYPE` 拒绝。
- **DNS 重绑定防御 (DNS Rebinding Protection)**：校验 `Host` 请求头是否属于本地环回白名单（`localhost`、`127.0.0.1`、`[::1]` 及配置的监听 IP）。非法主机头直接返回 403 `HOST_NOT_ALLOWED`。
- **请求体积限制**：严格限制单个 MCP 请求体不超过 1 MiB（1,048,576 字节），超限返回 413 `Payload Too Large`。
- **速率与并发限制**：基于令牌桶机制限制单令牌每分钟最多 60 次请求，最大并发度为 10。

### 13. 桌面控制中心与人工审批机制 (Phase 11)

LocalBridge Phase 11 建立了基于 Tauri 2 + React + TypeScript + Vite 的原生桌面管理程序（`apps/desktop/`），配合本地环回管理通道与 Human-in-the-Loop 审批流程，实现免命令行、可视化、安全可控的桌面运维体系。

#### 桌面控制中心 (`apps/desktop`)
- **现代化 Tauri 2 架构**：轻量级桌面客户端，提供直观的运行状态概览、项目权限管控面板、后台任务追踪器、实时审计日志流与 MCP 令牌管理面板。
- **严密 Tauri 权限沙箱**：Webview 权限严格收敛至 `core:default` 与 `dialog:default`。彻底剔除底层系统 Shell 插件（`tauri-plugin-shell`）与直接磁盘写入插件（`tauri-plugin-fs`），所有写操作均经由安全通道校验执行。
- **原生文件系统选择器**：集成操作系统原生目录对话框，安全选取需授权的项目物理路径。

#### 本地独占环回管理通道 (Loopback Management Channel)
- **仅限本地环回 REST 路由**：管理端点（`/api/management/*`、`/api/tokens`、`/api/pause`、`/api/emergency-stop`、`/api/approvals`、`/api/jobs`、`/api/audit`）严格仅绑定并允许本地环回地址访问（`127.0.0.1`、`::1`、`localhost`）。
- **外部 AI 完全隔离防护**：外部 AI 客户端通过 Streamable HTTP（`POST /mcp`）接入，**严禁且无法访问任何管理路由**，绝无可能创建/删除 Token、变更项目权限或对自己发起的审批请求进行自审批。

#### 人工审批中心 (Approval Center)
- **全局唯一审批标识**：对敏感越权或代码执行操作动态生成 `approval_<UUIDv4>` 凭证。
- **5 分钟自动超时**：任何未在 300 秒内获得人工决断的审批请求将自动失效，杜绝悬挂权限残留。
- **SHA-256 参数完整性校验**：创建审批时对敏感参数（执行命令、目标路径、工作目录等）进行 SHA-256 哈希固化。决断时严格比对哈希值，一旦检测到参数被篡改立即阻断。
- **单次使用即销毁 (Single-Use)**：每个审批凭证仅允许决断与执行一次，严防重放攻击。
- **Runner 关机即刻销毁**：Runner 进程断开或重启时，所有未决审批立即失效。

#### 紧急熔断与访问冻结
- **一键暂停 AI 访问 (Global Pause)**：桌面顶部控制栏提供实时开关，开启后所有进来的 AI MCP 请求将直接返回 HTTP 503 `Service Paused`，同时保持 Runner 进程及桌面程序正常运作。
- **紧急熔断 (Emergency Stop)**：一键强制杀死当前 Runner 宿主机上所有正在运行的后台任务进程树（Windows 下通过 `taskkill.exe /PID <pid> /T /F`，POSIX 下通过进程组机制），并同步开启全局暂停。

### 15. 安全加固与 v1.0 正式发布 (Phase 12)

LocalBridge v1.0 标志着功能冻结（Feature Freeze）与生产级全方位安全加固的完成：

- **三域 Token 绝对隔离**：严格区分 `lb_`（MCP 客户端）、`lbr_`（Runner 守护进程）与 `lm_`（桌面管理通道）三种 Token 前缀。任何跨域复用 Token 的行为均被严格拦截并返回 401/403 错误。
- **金丝雀脱敏与安全审计白名单**：实施 `SafeAuditMetadata` 字段白名单机制，敏感文件补丁、Diff 内容、执行命令参数、标准输入输出流（stdout/stderr）以及认证凭证绝不记录至审计日志与数据库中。
- **浏览器跳板与 DNS 重绑定防御**：强制 Host 请求头白名单校验，拦截非本地 Origin，并直接阻断跨站浏览器请求（`Sec-Fetch-Site: cross-site`）。
- **状态完整性与崩溃自动恢复**：数据库迁移前自动生成时间戳备份快照（`<dbPath>.pre-migration.bak`），Runner 启动时自动清理历史孤立临时文件（`.localbridge-*.tmp`）。
- **全量测试基线**：75 个自动化测试套件共 450 个测试用例，达成 100% 通过率。

### 安全与隐私文档指引

- [安全政策与漏洞披露流程 (SECURITY.md)](SECURITY.md)
- [STRIDE 威胁建模与 14 类威胁防御规范 (THREAT_MODEL.md)](docs/THREAT_MODEL.md)
- [隐私政策与零遥测承诺 (PRIVACY.md)](PRIVACY.md)
- [版本变更日志 (CHANGELOG.md)](CHANGELOG.md)
- [软件物料清单 (SBOM)](sbom.json)
- [发行版 SHA-256 校验和 (SHA256SUMS.txt)](SHA256SUMS.txt)

---

## 开源协议

[MIT](LICENSE)

