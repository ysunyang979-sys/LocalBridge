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
- **双 Token 体系绝对隔离**：MCP 客户端 Token（`lb_` 前缀）与 Runner 认证 Token（`lbr_` 前缀）均基于 256-bit 高熵随机数（`crypto.randomBytes(32)`）生成，数据库仅存储 SHA-256 哈希值（`token_hash`），明文 Token 仅在创建时返回一次，绝不落地。
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

---

## 开源协议

[MIT](LICENSE)
