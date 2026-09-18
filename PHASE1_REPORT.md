# Phase 1 Completion Report: LocalBridge Monorepo & Server Baseline

## 1. 实际目录树 (Monorepo Directory Tree)

```text
localbridge/
├── .gitignore
├── LICENSE
├── README.md
├── README.zh-CN.md
├── PHASE1_REPORT.md
├── config.example.json
├── config.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── apps/
│   └── server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── app.ts                  # Fastify 5 实例工厂、CORS与标准错误处理
│           ├── index.ts                # 服务端启动与优雅关机（SIGINT/SIGTERM）
│           ├── db/
│           │   ├── index.ts            # better-sqlite3 WAL 模式与外键约束连接
│           │   ├── migrate.ts          # 独立迁移引擎（Bootstrap schema_migrations）
│           │   ├── schema.ts           # 强类型数据行定义（TokenRow, ProjectRow 等）
│           │   └── migrations/
│           │       └── 0001_initial.sql # 业务数据表初始化（tokens, runners, projects, audit_logs）
│           └── routes/
│               ├── health.ts           # GET /api/health
│               └── status.ts           # GET /api/status
├── packages/
│   ├── protocol/                       # 纯协议包（TypeScript 严格模式，零外部网络/存储依赖）
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── version.ts              # PROTOCOL_VERSION = "1.0"
│   │       ├── errors.ts               # LocalBridgeErrorCode 枚举与 LocalBridgeError
│   │       ├── models/
│   │       │   ├── job.ts              # 异步任务模型
│   │       │   ├── project.ts          # Project 与脱敏 ProjectPublic 模型
│   │       │   └── runner.ts           # RunnerCapabilities 与 RunnerSystemInfo 模型
│   │       └── runner/
│   │           ├── messages.ts         # JSON-RPC 2.0 规范信封与 Zod Schema
│   │           ├── methods.ts          # Runner RPC 方法常量定义
│   │           ├── requests.ts         # 参数 Zod Schema（强校验）
│   │           └── responses.ts        # 响应结果 Zod Schema
│   ├── security/                       # 安全策略接口定义
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       └── types.ts                # CommandRiskLevel（SAFE/CAUTION/DANGEROUS）与敏感文件正则
│   └── shared/                         # 跨模块共享基础库
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── crypto.ts               # 256-bit 熵高强度 Token 生成、SHA-256 单向哈希与时序安全对比
│           ├── index.ts
│           ├── logger.ts               # Pino 结构化日志与敏感字段自动脱敏（Redaction）
│           └── config/
│               ├── loader.ts           # 配置加载器（Default < config.json < Env < CLI）
│               └── schema.ts           # 配置 Zod Schema
├── tests/                              # 自动化测试套件（Vitest）
│   ├── config.test.ts
│   ├── crypto.test.ts
│   ├── db-migration.test.ts
│   ├── protocol.test.ts
│   └── server-api.test.ts
├── docs/
│   └── architecture.md
└── scripts/
    └── check-env.js
```

---

## 2. Node / pnpm 版本 (Environment Versions)

- **项目 Runtime 基线声明 (`package.json.engines`)**:
  - `node`: `">=24"`
  - `pnpm`: `">=10"`
- **当前执行测试环境**:
  - `Node.js`: `v22.14.0`
  - `pnpm`: `10.14.0`
  - `TypeScript`: `5.7.3` / `5.9.3`
  - `better-sqlite3`: `11.8.1` / `11.10.0`
  - `Fastify`: `5.2.1` / `5.12.5`
  - `Pino`: `9.6.0`

---

## 3. Build 结果 (Build Output)

命令：`pnpm build`
状态：`EXIT CODE 0`

```text
> localbridge-monorepo@0.1.0 build
> pnpm -r --filter=./packages/* run build && pnpm --filter=@localbridge/server run build

Scope: 3 of 5 workspace projects
packages/protocol build: ESM dist/index.js (10.75 KB), DTS dist/index.d.ts (35.59 KB)
packages/security build: ESM dist/index.js (1.58 KB), DTS dist/index.d.ts (2.38 KB)
packages/shared build:   ESM dist/index.js (8.23 KB), DTS dist/index.d.ts (8.66 KB)

> @localbridge/server@0.1.0 build
> tsup src/index.ts --format esm --clean && node -e "const fs=require('fs'); if (fs.existsSync('src/db/migrations')) fs.cpSync('src/db/migrations', 'dist/migrations', { recursive: true })"
ESM dist/index.js (6.20 KB)
```

---

## 4. Typecheck 结果 (Typecheck Output)

命令：`pnpm typecheck`
状态：`EXIT CODE 0`（代码库无 `any`、无 `@ts-ignore`、无编译跳过）

```text
Scope: 4 of 5 workspace projects
packages/protocol typecheck$ tsc --noEmit (Done)
packages/security typecheck$ tsc --noEmit (Done)
packages/shared typecheck$ tsc --noEmit (Done)
apps/server typecheck$ tsc --noEmit (Done)
```

---

## 5. Test 结果 (Automated Tests via Vitest)

命令：`pnpm test`
状态：`EXIT CODE 0`（全量 21 项测试通过，无 skip，无 ignore）

```text
 RUN  v3.2.7 E:/workspace/cod

 ✓ tests/protocol.test.ts (7 tests)
 ✓ tests/crypto.test.ts (4 tests)
 ✓ tests/config.test.ts (4 tests)
 ✓ tests/db-migration.test.ts (3 tests)
 ✓ tests/server-api.test.ts (3 tests)

 Test Files  5 passed (5)
      Tests  21 passed (21)
   Start at  08:17:36
   Duration  1.16s
```

### 覆盖核心场景：
1. **纯协议包设计**：协议版本号 `PROTOCOL_VERSION = "1.0"`、Zod 严格校验 JSON-RPC 2.0 请求/响应/通知模型、`LocalBridgeError` 结构化序列化、项目公开视图根路径强隔离脱敏。
2. **Token 安全模型**：
   - MCP Token 采用 `crypto.randomBytes(32)` 生成 256-bit 随机熵，前缀 `lb_`（共 67 字符）。
   - Runner Token 采用 `crypto.randomBytes(32)` 生成 256-bit 随机熵，前缀 `lbr_`（共 68 字符）。
   - 数据库只存储单向 `SHA-256(full_token)` 哈希值（`token_hash`），明文仅返回一次永不落地。
   - 采用 `crypto.timingSafeEqual` 进行恒定时间（constant-time）安全比对，杜绝时序侧信道攻击。
3. **配置优先级**：严格验证 `Default < config.json < Environment Variables < CLI Arguments`，格式错误立即拒绝启动并输出明确诊断。
4. **数据库与迁移引擎**：
   - Migration 引擎负责自举 `schema_migrations` 版本追踪表。
   - `0001_initial.sql` 只包含业务表（`tokens`、`runners`、`projects`、`audit_logs`）。
   - 每次迁移使用事务（`BEGIN ... COMMIT`），保证原子性与幂等性，失败自动 ROLLBACK 阻止服务启动。
   - 跨数据库重启数据持久性验证完毕。
5. **REST API**：`/api/health` 与 `/api/status` 强类型路由与全局错误处理器正常响应。

---

## 6. Health API 测试结果 (Live HTTP Probe)

请求：
```http
GET /api/health HTTP/1.1
Host: 127.0.0.1:18080
```

响应：
```json
{
  "status": "ok"
}
```

---

## 7. Status API 测试结果 (Live HTTP Probe)

请求：
```http
GET /api/status HTTP/1.1
Host: 127.0.0.1:18080
```

响应：
```json
{
  "server": "LocalBridge Server",
  "version": "0.1.0",
  "runners_connected": 0,
  "mcp_active": false
}
```

*说明：`mcp_active: false` 真实反映当前 Phase 1 阶段尚未启动 MCP 运行时，严禁任何伪造 handler。*

---

## 8. 已知考量 (Known Considerations)

1. **better-sqlite3 预编译二进制构建**：在 `package.json` 中配置了 `pnpm.onlyBuiltDependencies: ["better-sqlite3", "esbuild"]`，保证在干净机器上能够顺利编译和使用预编译二进制库。
2. **MCP SDK v2 挂载边界**：已严格将协议与数据结构解耦，真实 MCP 运行时将在 Phase 9 正式引入 `@modelcontextprotocol/server` 和 `@modelcontextprotocol/fastify` 挂载 `POST /mcp`。

---

## 9. 下一阶段建议 (Next Phase Recommendations)

进入 **Phase 2 (Runner)** 时，重点实现：
1. 搭建 `apps/runner` 客户端守护进程框架。
2. 实现 Runner 本地运行环境深度自省：OS、Node、Git CLI、ripgrep、Python、Docker 等工具链探测。
3. 实现 Runner 配置文件读取及受限根目录（`allowed_roots`）初始化。
4. 编写针对 Runner 本地初始化与工具探测的自动化单元测试。
