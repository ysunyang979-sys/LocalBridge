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

## 代码仓库结构 (Monorepo)

```text
localbridge/
├── apps/
│   ├── server/           # Fastify 服务端（MCP 端点、REST API、SQLite 状态存储）
│   ├── runner/           # 本地执行守护进程（Phase 2+）
│   └── desktop/          # Tauri 2 + React + Vite 极简桌面应用（Phase 10+）
├── packages/
│   ├── protocol/         # 纯协议定义层、JSON-RPC 2.0 模式、统一错误码
│   ├── shared/           # Pino 结构化日志、多级配置加载器、加密工具
│   ├── security/         # 路径逃逸检测、命令风险评估引擎接口
│   ├── mcp/              # MCP v2 工具集成与 Streamable HTTP（基于 @modelcontextprotocol/server，Phase 9）
│   └── ui/               # 共享 UI 组件与设计令牌（Phase 10+）
├── tests/                # 单元测试与端到端测试套件
├── docs/                 # 详细架构与协议设计规范
└── scripts/              # 构建与辅助脚本
```

---

## 快速上手 (Phase 2)

### 环境要求
- **Node.js**: `>= 24.0.0`
- **pnpm**: `>= 10.0.0`

### 安装与构建

```bash
# 安装 Monorepo 所有依赖
pnpm install

# TypeScript 类型检查
pnpm typecheck

# 编译所有 packages、server 与 runner
pnpm build

# 运行全套自动化测试 (Vitest)
pnpm test
```

### 1. 启动 LocalBridge 服务端

启动 LocalBridge Server 守护进程：

```bash
pnpm --filter @localbridge/server dev
```

服务默认监听 `http://127.0.0.1:18080`。

### 2. 生成 Runner 认证令牌 (Token)

生成经密码学认证的 Runner Token（仅显示一次，数据库仅存储 SHA-256 哈希）：

```bash
pnpm --filter @localbridge/server token:create runner "My PC"
```

查看或撤销 Token：
```bash
# 查看所有已注册令牌
pnpm --filter @localbridge/server token:list

# 撤销指定令牌
pnpm --filter @localbridge/server token:revoke <token_id>
```

### 3. 启动 LocalBridge Runner 守护进程

**Linux / macOS (Bash):**
```bash
LOCALBRIDGE_RUNNER_TOKEN=lbr_xxxxxxxxxxxxxxxxx \
pnpm --filter @localbridge/runner dev
```

**Windows (PowerShell):**
```powershell
$env:LOCALBRIDGE_RUNNER_TOKEN="lbr_xxxxxxxxxxxxxxxxx"
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

> [!IMPORTANT]
> **Phase 6 状态声明**：LocalBridge 当前处于 Phase 6（安全文件修改与事务式写操作）。仅在被本地用户显式授予 `read-write` 权限的项目中激活安全、防冲突的文件写入与恢复。Shell 执行、Git 操作、构建/测试运行及 MCP 运行时端点在此阶段依然严格禁止。

### 9. 管理 API 安全边界与本地访问说明

- **默认监听环回地址 (`127.0.0.1`)**：LocalBridge Server 默认仅绑定到 `127.0.0.1`。管理 REST 端点（如 `/api/status`、`/api/runners`、`/api/projects`、`/api/runners/:id/ping` 以及 `/api/runners/:id/system-info`）仅面向本地管理探针及受信任的环回访问。
- **外部暴露安全免责声明**：若将 LocalBridge Server 绑定到非环回网卡（如 `0.0.0.0`）或反向代理，管理路由 `/api/*` 必须通过鉴权网关或反向代理防火墙进行严格访问控制，以防未授权设备进行信息嗅探与诊断探测。

---

## 开源协议

[MIT](LICENSE)
