# LocalBridge Phase 4 Completion Report: Local Project Authorization & Sandboxing

**Status**: COMPLETED & VERIFIED  
**Date**: 2026-09-18  
**Baseline Verification Environment**: Node.js `v24.21.0`, pnpm `10.14.0`, Windows (x64)

---

## 1. 架构目标达成说明

Phase 4 的唯一核心使命是：**建立“用户明确授权项目 → Project ID → Runner 本地真实目录 → 安全路径解析”的不可逾越的可信边界**。

在 Phase 4 中，成功实现了以下关键架构：
1. **Runner 本地项目注册表 (`apps/runner/src/projects/`)**：
   - 采用原子写入文件机制（临时文件 + `fsync` + `rename`），确保状态文件 `projects.json` 永不损坏。
   - 分配持久、强随机的稳定项目标识符 `proj_<UUIDv4>`，重启后 ID 保持不变。
   - 彻底拦截重复物理目录授权（包括尾随斜杠、大小写混淆、相对路径折叠）。
   - 支持子目录嵌套项目分别授权为独立项目。
2. **本地项目 CLI 命令行工具 (`apps/runner/src/cli/project-cli.ts`)**：
   - 提供 `project:add`, `project:list`, `project:remove`, `project:enable`, `project:disable` 完整操作。
3. **安全路径沙箱模块 (`@localbridge/security`)**：
   - 实现多层路径防御：词法校验、Windows 平台特化防御、物理规范化、前缀混淆防御、软链接/Junction 穿越防御以及高危敏感凭证屏蔽。
4. **强类型 Runner RPC 扩展与物理路径零泄露 (`@localbridge/protocol`)**：
   - 增加 `project.list`, `project.info`, `project.validate` RPC 接口。
   - 严禁在 RPC 返回中包含 `root`, `canonicalRoot`, `absolutePath` 或任何物理路径。
5. **Server 端元数据同步与 REST API (`apps/server`)**：
   - 数据库迁移 `0002_projects_metadata.sql`：数据库仅保留公共元数据 (`id`, `runner_id`, `name`, `enabled`, `first_seen_at`, `last_seen_at`)，不包含任何本地物理路径列。
   - Runner 握手就绪后自动拉取已授权项目列表并同步至 SQLite。
   - 提供 `GET /api/projects` 与 `GET /api/projects/:id`，动态计算 `available` 状态。
   - 严正拒绝远端授权尝试：`POST /api/projects` 与 `PUT /api/projects/:id/path` 均返回 `405 Method Not Allowed`。

> [!IMPORTANT]
> **安全红线遵守声明**：本阶段坚决杜绝了任何实际文件读取、文件写入、目录列出、Shell 执行及 MCP 运行时。物理路径永远停留在 Runner 机器内部。

---

## 2. 安全边界与沙箱机制详解

### 2.1 零远端授权边界 (Zero Remote Authorization)
- **远端不可达**：AI 模型、外部 MCP Client 以及云端/外部 LocalBridge Server 绝对无法指定、创建或修改本地授权目录。
- **本地所有权**：只有物理访问机器的用户可以通过 Runner CLI 操作本地 `projects.json`。
- **脱敏传输**：Server 与 AI 永远只能接触到 `ProjectPublic`（包含 `id`, `runnerId`, `name`, `enabled`, `available`），物理真实路径严禁序列化到网络报文中。

### 2.2 多层纵深路径沙箱架构
```text
用户输入 targetPath
       │
       ▼
[Tier 1: 词法拦截 (Lexical Checks)]
 ├── Null Byte (\0)
 ├── 遍历字符 (../, ..\, 混合分隔符)
 ├── 绝对路径 (C:\, /etc)
 ├── 盘符相对 (C:foo) 与 根相对 (\foo, /foo)
 ├── Windows 设备命名空间 (\\?\, \\.\) 与 UNC (\\server\share)
 ├── NTFS 备用数据流 (:)
 ├── Windows 保留设备名 (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 └── 尾随点/空格 (foo.txt., foo.txt )
       │
       ▼
[Tier 2: 敏感文件策略过滤 (Sensitive Policy)]
 ├── .env, .env.*, credentials.json, client_secret*.json
 ├── *.pem, *.key, id_rsa*, id_ed25519*
 └── .ssh/*, .aws/*, .git/*
       │
       ▼
[Tier 3: 物理规范解析 (Canonical Resolution)]
 ├── fs.realpathSync.native (解析真实磁盘节点)
 ├── 去除 Windows 长路径前缀 (\\?\)
 └── 祖先节点回溯校验 (针对尚未创建的深层目标)
       │
       ▼
[Tier 4: 前缀混淆与软链接逃逸防护 (Containment & Escape Detection)]
 ├── isPathInside(canonicalRoot, canonicalTarget)
 └── path.relative() 相对距离断言 (禁止 leading '..' / 跨驱动器跳转)
       │
       ▼
安全合法解析结果 (Safe Resolved Path)
```

---

## 3. Windows 平台特化防御详解

Windows 平台由于历史兼容性与 NTFS 特性，存在大量潜在路径解析旁路。我们在 `@localbridge/security` 中专门构建了针对性防御：

1. **UNC 网络路径拦截 (`PATH_UNC_NOT_ALLOWED`)**：
   - 拦截以 `\\` 或 `//` 开头的路径，防止通过 SMB/WebDAV 请求发起内网探测或 NTLM 凭证中继攻击（NTLM Hash Leaks）。
2. **NT 设备命名空间拦截 (`PATH_DEVICE_NOT_ALLOWED`)**：
   - 拦截 `\\?\` 与 `\\.\` 前缀，阻断 Win32 子系统路径安全规范化绕过。
3. **NTFS 备用数据流拦截 (`PATH_ADS_NOT_ALLOWED`)**：
   - 拦截任何包含冒号 `:` 的相对路径，防止利用 `file.txt:stream` 隐藏数据或利用 `::$DATA` 绕过扩展名策略检查。
4. **DOS 保留设备名防御 (`PATH_INVALID_WINDOWS_NAME`)**：
   - 拦截 `CON`, `PRN`, `AUX`, `NUL`, `COM1`~`COM9`, `LPT1`~`LPT9` 及其带后缀形式（如 `aux.txt`、`con.ts`），防止造成进程假死、拒绝服务或驱动异常。
5. **尾随点与空格剥离防御 (`PATH_INVALID_WINDOWS_NAME`)**：
   - Windows 文件系统在创建和访问文件时会自动剔除文件名末尾的点和空格。攻击者可能输入 `safe.ts.` 或 `safe.ts ` 绕过正则黑名单而实际操作 `safe.ts`。沙箱对路径所有片段的尾随点和空格坚决予以拦截。
6. **Windows 长路径前缀规范化**：
   - Windows 原生 API 在解析规范符号链接时经常返回 `\\?\C:\...`。我们在沙箱中统一剔除 `\\?\` 前缀，保证后续 `path.relative` 与字符串大小写规范化逻辑一致。

---

## 4. TOCTOU 风险分析与工程缓解

**TOCTOU (Time-of-Check to Time-of-Use) 风险说明**：  
在非并发原子操作的文件系统中，如果在第 1 步检查了路径合法性，而在第 2 步实际打开/读取/写入文件，攻击者可能在此间隙内将目标目录或父目录替换为指向系统高危位置的软链接（Symlink Race）。

**工程缓解措施**：
1. **代码注释与安全契约标明**：在 `@localbridge/security/src/path/resolver.ts` 中详细记录 TOCTOU 攻击面。
2. **最近祖先物理锁定**：针对未来写操作/创建操作中尚不存在的深层文件路径，沙箱向上逐级回溯至当前磁盘上真实存在的最近祖先物理目录，并通过 `realpathSync.native` 锁定该祖先节点绝对在 `canonicalRoot` 内部。
3. **Phase 5 预备策略**：在 Phase 5/6 真正进行文件 I/O 时，优先采用文件描述符驱动（File Descriptor-based）操作或在操作打开后执行 `fstat` 二次比对设备号与 inode (`dev` / `ino`)，彻底斩断符号链接赛跑利用链。

---

## 5. 测试用例清单与通过结果矩阵

在 Node.js `v24.21.0` 统一基线下，所有 20 个测试文件（共 156 项测试）全部通过，退出码 0。

### 核心 Phase 4 验收矩阵

| 测试文件 | 测试用例数 | 关键测试点 | 状态 |
|---------|-----------|-----------|------|
| `tests/project-registry.test.ts` | 9 | 项目添加、稳定 `proj_<UUIDv4>` ID、重启持久化、项目移除、启用/禁用、重复物理根拦截、路径不存在/非目录拦截、嵌套项目独立授权、原子写入抗崩溃 | **PASSED** |
| `tests/sandbox-path.test.ts` | 17 | 相对路径解析、`../` 穿越拦截、`..\` 穿越拦截、混合分隔符拦截、绝对路径拦截、盘符相对/根相对拦截、UNC 拦截、NT 设备命名空间拦截、空字节注入拦截、前缀混淆防御、NTFS ADS 拦截、Windows 保留设备名拦截、尾随点空格拦截、深层不存在路径祖先回溯校验、越界回溯拦截 | **PASSED** |
| `tests/symlink-junction.test.ts` | 4 | 越界 Directory Junction 拦截 (`PATH_SYMLINK_ESCAPE`)、越界 Symlink 拦截、合规项目内 Symlink 解析、越界链接下不存在文件的拦截 | **PASSED** |
| `tests/sensitive-policy.test.ts` | 37 | `.env*` 系列识别、SSH 私钥识别、`*.pem`/`*.key` 识别、`.git/*` 内部文件屏蔽、`.aws/*` 凭据屏蔽、`credentials.json` 识别；杜绝误杀（`keyboard.ts`、`monkey.pem.txt`、`environment.md` 等） | **PASSED** |
| `tests/project-rpc.test.ts` | 7 | `project.list` 脱敏输出、`project.info` 脱敏输出、`project.validate` 合法校验、穿越路径拦截及原因返回、敏感凭证识别返回、禁用项目拦截 (`PROJECT_DISABLED`)、**全 RPC 响应报文序列化扫描（物理路径零泄露断言）** | **PASSED** |
| `tests/project-integration.test.ts` | 6 | Server 启动、Runner 握手、项目列表自动同步、`GET /api/projects` (`available: true`)、`GET /api/projects/:id`、404 未知项目、`POST /api/projects` (405 拦截)、`PUT /api/projects/:id/path` (405 拦截)、Runner 离线自动标记 (`available: false`) | **PASSED** |

### 历史回归测试矩阵
- `tests/db-migration.test.ts`: 3 tests passed (验证 `0002_projects_metadata.sql` 移除 `root` 列)
- `tests/runner-auth.test.ts`: 7 tests passed
- `tests/runner-handshake.test.ts`: 3 tests passed
- `tests/runner-registry.test.ts`: 5 tests passed
- `tests/runner-rpc-router.test.ts`: 9 tests passed
- `tests/runner-rpc-integration.test.ts`: 6 tests passed
- `tests/runner-integration.test.ts`: 1 test passed
- `tests/server-api.test.ts`: 3 tests passed
- `tests/rpc-pending.test.ts`: 10 tests passed
- `tests/rpc-protocol.test.ts`: 8 tests passed
- `tests/protocol.test.ts`: 7 tests passed
- `tests/crypto.test.ts`: 4 tests passed
- `tests/config.test.ts`: 5 tests passed
- `tests/reconnect.test.ts`: 5 tests passed

**总体验收结果**：
- **测试套件**：20 passed / 20 total
- **用例总数**：156 passed / 156 total
- **TypeScript 类型检查**：`pnpm typecheck` (0 errors)
- **Monorepo 构建**：`pnpm build` (exit code 0)

---

## 6. 下一阶段准备情况

Phase 4 已圆满收官，LocalBridge 已具备生产级、坚不可摧的项目授权基石与路径沙箱防御体系。

**下一阶段（Phase 5 — Safe Read-Only Filesystem & Directory Browsing）准备工作已就绪**：
- `@localbridge/security` 沙箱解析器已可直接提供给文件浏览与读取使用。
- 敏感凭证过滤机制已就绪。
- 项目状态与授权已稳定持久化。
- 协议层与 RPC 通信管道运行稳定可靠。
