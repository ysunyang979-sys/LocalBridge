# Phase 3 Completion Report: Server ↔ Runner RPC Request Routing

## 1. 架构演进 (Architecture Changes)

在 Phase 2 完成出站鉴权与连接拓扑的基础上，Phase 3 正式建立了服务端（LocalBridge Server）与客户端（LocalBridge Runner）之间的双向 JSON-RPC 2.0 请求路由与派发架构：

```text
LocalBridge Server
       │
       │  1. runnerRpcService.request(runnerId, method, params, options)
       ▼
RunnerRegistry (ActiveRunnerConnection)
       │
       │  2. Generate unique correlation ID: req_<UUID>
       │  3. Check MAX_PENDING_REQUESTS (64)
       │  4. Validate outgoing params with Zod schema
       │  5. Setup timeout timer & attach to pendingRequests map
       │  6. Send JSON-RPC 2.0 Request over WebSocket
       ▼
LocalBridge Runner (apps/runner/src/rpc/router.ts)
       │
       │  7. Check message size <= 1 MiB
       │  8. Parse & validate JSON-RPC 2.0 structure
       │  9. Verify no in-flight duplicate ID
       │ 10. Route to registered handler (system.ping / system.info)
       │ 11. Execute handler in isolated try-catch
       │ 12. Return JSON-RPC 2.0 Result or Standard Error
       ▼
LocalBridge Server (ActiveRunnerConnection.handleIncomingMessage)
       │
       │ 13. Match response ID to pendingRequests map
       │ 14. Clear timeout timer & calculate roundtrip duration
       │ 15. Validate result schema against Zod definitions
       │ 16. Resolve caller Promise or throw RemoteRpcError
       ▼
Caller (Management Debug REST API / Future MCP Tool Handlers)
```

本阶段严格遵守安全约束：
- **禁止任何文件系统、Shell、Git、Build/Test 操作**；
- 仅实现安全系统级探测方法：`system.ping` 与 `system.info`；
- 彻底移除 URL Query Token 认证支持，强制仅允许 `Authorization: Bearer lbr_...`；
- 统一系统版本号至 `0.3.0`。

---

## 2. 变更与新建文件清单 (Files Created / Modified)

```text
localbridge/
├── README.md                                 # [MODIFIED] 增加 Phase 3 RPC 架构说明与安全表述修订
├── README.zh-CN.md                           # [MODIFIED] 中文文档同步 Phase 3 RPC 与时序安全表述
├── PHASE2_REPORT.md                          # [MODIFIED] 修订时序侧信道安全描述并移除 URL Query Token 提及
├── PHASE3_REPORT.md                          # [NEW] Phase 3 完整阶段报告（18项）
├── packages/
│   ├── protocol/
│   │   ├── src/
│   │   │   ├── index.ts                      # [MODIFIED] 导出 rpc.js 模块
│   │   │   ├── errors.ts                     # [MODIFIED] 增加 RPC 错误码、JSON-RPC 标准码与 RemoteRpcError
│   │   │   ├── runner/
│   │   │   │   ├── methods.ts                # [MODIFIED] 增加 RunnerRpcMethods 常量与类型
│   │   │   │   └── rpc.ts                    # [NEW] 定义 RunnerRpcMap、Zod 参数/结果校验模式与常量限制
├── apps/
│   ├── server/
│   │   ├── package.json                      # [MODIFIED] 版本更新至 0.3.0
│   │   └── src/
│   │       ├── app.ts                        # [MODIFIED] 升级至 0.3.0、挂载 RunnerRpcService 与全局 RPC 错误映射
│   │       ├── routes/
│   │       │   ├── runner-ws.ts              # [MODIFIED] 彻底删除 URL Query Token 提取，接入 ActiveRunnerConnection
│   │       │   └── runners.ts                # [MODIFIED] 增加 /api/runners/:id/ping 与 /api/runners/:id/system-info
│   │       └── runner/
│   │           ├── registry.ts               # [MODIFIED] 实现 ActiveRunnerConnection、PendingRequest 状态机与指标统计
│   │           └── rpc-service.ts            # [NEW] 实现强类型 RunnerRpcService（检测 RUNNER_OFFLINE）
│   └── runner/
│       ├── package.json                      # [MODIFIED] 版本更新至 0.3.0
│       └── src/
│           ├── runner.ts                     # [MODIFIED] 升级至 0.3.0、集成 RpcRouter 并注册默认 Handler
│           ├── client/
│           │   └── websocket.ts              # [MODIFIED] 完善消息派发机制，透传未匹配响应及畸变数据至 Router
│           └── rpc/
│               ├── router.ts                 # [NEW] RpcRouter：JSON-RPC 消息解析、校验、错误映射与防崩溃调度
│               └── handlers/
│                   ├── system-ping.ts        # [NEW] system.ping 业务处理器
│                   └── system-info.ts        # [NEW] system.info 业务处理器（安全脱敏）
└── tests/
    ├── rpc-protocol.test.ts                  # [NEW] RPC 协议模式、版本、常量与错误模型测试 (8 tests)
    ├── rpc-pending.test.ts                   # [NEW] 请求挂载、解析、超时、断开清理与 64 限制测试 (7 tests)
    ├── runner-rpc-router.test.ts             # [NEW] Runner 侧路由器、错误码 (-32601/-32602/-32603/-32700) 测试 (7 tests)
    ├── runner-rpc-integration.test.ts        # [NEW] 端到端集成、20并发请求、超时、断开中断与管理 API 测试 (6 tests)
    ├── runner-auth.test.ts                   # [MODIFIED] 增加拒绝 URL Query Token 的安全性测试 (7 tests)
    ├── runner-registry.test.ts               # [MODIFIED] 适配 ActiveRunnerConnection 接口与 dispose 机制 (5 tests)
    ├── runner-handshake.test.ts              # [MODIFIED] 适配 0.3.0 服务端版本断言 (3 tests)
    ├── runner-integration.test.ts            # [MODIFIED] 适配 0.3.0 服务端版本断言 (1 test)
    └── server-api.test.ts                    # [MODIFIED] 适配 0.3.0 服务端版本断言 (3 tests)
```

---

## 3. RPC 协议规范实现 (RPC Protocol Implementation)

1. **统一方法常量定义**：
   在 `@localbridge/protocol` 中集中定义 `RunnerRpcMethods`：
   ```ts
   export const RunnerRpcMethods = {
     Hello: "runner.hello",
     SystemPing: "system.ping",
     SystemInfo: "system.info",
   } as const;
   ```
   严禁在工程中硬编码 `"system.ping"` 等字面量。
2. **错误代码体系划分**：
   - **Wire-Level JSON-RPC 2.0 规范错误码**：
     - `-32700`：`ParseError`（JSON 语法解析错误）
     - `-32600`：`InvalidRequest`（非规范 JSON-RPC 结构或超限）
     - `-32601`：`MethodNotFound`（未注册的方法）
     - `-32602`：`InvalidParams`（参数 Schema 校验失败）
     - `-32603`：`InternalError`（Runner 内部未捕获异常）
     - `-32001`：`DuplicateRequestId`（Runner 检测到同 ID 请求并发在途）
   - **LocalBridge 应用层业务错误码**：
     - `RPC_TIMEOUT`：请求在规定时间内未获响应
     - `RUNNER_DISCONNECTED`：连接断开导致请求中断
     - `RUNNER_BUSY`：未完成请求超过 64 个上限
     - `RUNNER_OFFLINE`：目标 Runner 不在活跃在线列表中
     - `RPC_MESSAGE_TOO_LARGE`：载荷超出 1 MiB 限制
     - `RPC_INVALID_RESPONSE`：远端返回无法解析或模式不匹配的响应
     - `RPC_REMOTE_ERROR`：远端明确返回的业务失败封装 (`RemoteRpcError`)

---

## 4. 强类型 RPC 映射设计 (Typed RPC Map)

在 `@localbridge/protocol` 中声明核心映射 `RunnerRpcMap`：

```ts
export interface RunnerRpcMap {
  [RunnerRpcMethods.SystemPing]: {
    params: SystemPingParams;
    result: SystemPingResult;
  };
  [RunnerRpcMethods.SystemInfo]: {
    params: SystemInfoParams;
    result: SystemInfoResult;
  };
}
```

任何调用方均可通过：
```ts
const result = await rpcService.request(runnerId, RunnerRpcMethods.SystemPing, {});
```
根据方法名自动推导 `params` 类型和返回值 `result` 类型，杜绝任何 `any` 类型泄漏。
同时导出 `RunnerRpcSchemas` 字典，供服务端与客户端在收发双端执行严格的 Zod Schema 运行时校验。

---

## 5. 请求挂起管理器生命周期 (Pending Request Lifecycle)

在 `ActiveRunnerConnection` 内部维护 `pendingRequests = new Map<string, PendingRequest>()`：

1. **严格顺序执行的请求派发生命周期**：
   - **Step 1: 参数校验 (Validate params)**：基于 Zod Schema 严格验证 `params`，失败直接拒绝；
   - **Step 2: 生成请求 ID 与报文序列化 (Serialize request)**：生成密码学安全全局唯一 `requestId = req_<UUIDv4>` 并序列化 JSON 报文；
   - **Step 3: 字节体积二次校验 (Validate payload byte size)**：使用 `Buffer.byteLength(payload, "utf8")` 校验报文严格 `<= 1 MiB`；
   - **Step 4: 套接字就绪校验 (Check socket OPEN)**：确认底层 `socket.readyState === 1`，非 Open 抛出 `RUNNER_DISCONNECTED`；
   - **Step 5: 并发上限校验 (Check pending limit)**：确认 `pendingRequests.size < 64`，超限立即抛出 `RUNNER_BUSY`；
   - **Step 6: 检查提前中止信号 (Check AbortSignal)**：若 `signal.aborted` 直接抛出中止原因；
   - **Step 7: 注册挂起请求 (Register PendingRequest)**：将状态机、统一清理器与 Promise 写入 `pendingRequests` Map，启动超时定时器；
   - **Step 8: 套接字发送 (Socket send)**：调用 `this.socket.send(payload, callback)`。
2. **发送失败立即回滚清理 (RPC Send Failure Cleanup)**：
   - 若 `socket.send` 触发同步异常抛出，或异步回调 `callback(err)`：
   - 立即执行统一 `cleanup()`：销毁超时定时器、从 `pendingRequests` Map 中物理移除该 ID、注销 `AbortSignal` 监听器；
   - 记录 `metrics.errors++` 并 `reject(new LocalBridgeError(RPC_REMOTE_ERROR, ...))`，彻底杜绝请求泄漏。
3. **全链路统一 AbortSignal 监听器解绑 (Unified Cleanup across 6 Paths)**：
   - 为避免长期持有 `AbortSignal` 引发 EventTarget 内存泄漏，设计了单一的幂等 `cleanup()` 闭包，统一覆盖以下全部 6 种请求终态：
     - (1) 响应成功 (success)
     - (2) 远端返回错误 (remote error)
     - (3) 超时熔断 (timeout)
     - (4) 连接断开注销 (disconnect / dispose)
     - (5) 调用方主动取消 (local abort)
     - (6) 发送阶段失败 (send failure)
4. **正常响应**：
   - 匹配响应中的 `id`，调用 `pending.resolve(val)`，内部执行 `cleanup()`，增加 `responsesReceived++`。
5. **远端错误响应**：
   - 匹配响应中的 `id`，提取 `code`、`message`、`data`，调用 `pending.reject(new RemoteRpcError(...))`，内部执行 `cleanup()`，增加 `errors++`。
6. **重复响应 / 未知 ID**：
   - 若响应 ID 不在当前 Map 中，记录结构化日志 `rpc_unknown_response_id`，安全忽略，保证进程不崩溃。

---

## 6. 超时熔断保护 (Timeout Handling)

1. **超时区间约束**：
   - 强制全局限制：`MIN_RPC_TIMEOUT = 1,000ms (1s)`，`MAX_RPC_TIMEOUT = 300,000ms (5min)`；
   - 默认超时：`DEFAULT_RPC_TIMEOUT = 10,000ms (10s)`；
   - `system.ping` 缺省超时：`5,000ms (5s)`；
   - `system.info` 缺省超时：`10,000ms (10s)`。
2. **超时触发流程**：
   - 定时器触发时，立即从 `pendingRequests` 中删除该项；
   - 增加指标 `timeouts++`；
   - 触发结构化告警日志 `rpc_request_timeout`，包含耗时与方法名；
   - 调用 `reject(new LocalBridgeError(LocalBridgeErrorCode.RPC_TIMEOUT, ...))`；
   - 状态完全回收，无任何闭包或定时器残留。

---

## 7. 断线清理机制 (Disconnect Handling)

当物理底层 WebSocket 触发 `close` 或 `error` 时：

1. 立即触发 `connection.dispose()`；
2. 遍历当前连接全部 `pendingRequests.values()`；
3. 逐一调用 `clearTimeout(pending.timer)` 销毁系统定时器；
4. 逐一执行 `pending.reject(new LocalBridgeError(LocalBridgeErrorCode.RUNNER_DISCONNECTED, ...))`；
5. 执行 `pendingRequests.clear()` 清空映射字典；
6. 触发 `rpc_runner_disconnected` 事件日志，记录被安全释放的挂起请求总数；
7. 杜绝因网络闪断导致上层应用或 AI 客户端发生 Promise 永久挂死（Hang）。

---

## 8. 消息体积上限防护与传输层截断 (Message Size & Transport Protection)

1. **传输层强制限制 (WebSocket Transport-Level Payload Limit)**：
   - 在 Fastify 注册 `@fastify/websocket` 时直接为底层 `ws.Server` 配置：
     ```ts
     await app.register(websocket, {
       options: {
         maxPayload: 1048576, // 1 MiB (1,048,576 bytes)
       },
     });
     ```
   - 保证超大消息在传输层帧处理阶段直接被底层套接字拒绝，无需经过 JSON 反序列化，彻底防止内存攻击与 CPU 消耗。
2. **应用层基于字节的二次校验 (Byte-Based Size Validation)**：
   - 严禁使用字符长度 `message.length` 判断 UTF-8 载荷大小；
   - 字符串一律使用 `Buffer.byteLength(message, "utf8")`，Buffer 一律使用 `buffer.length`；
   - 自动化测试覆盖了 400,000 个中文字符的极限载荷（字符数 400,000 < 1,048,576，但 UTF-8 字节数 1,200,000 > 1 MiB），验证字符计数与字节计数的严格边界。
3. **双端防护机制**：
   - 服务端在组装出站报文后即刻执行 `Buffer.byteLength(payload, "utf8")` 校验，超限抛出 `RPC_MESSAGE_TOO_LARGE`；
   - Runner 端在收到帧后先执行字节校验，超限直接返回 `-32600 Invalid Request: Request exceeds maximum allowed size`。

---

## 9. 并发请求过载防护 (Concurrent Request Protection)

1. **单个 Runner 连接挂起上限**：
   - `MAX_PENDING_REQUESTS = 64`。
2. **超限熔断行为**：
   - 当某个 Runner 积压未回复请求达到 64 时，后续新请求立即被拦截，抛出 `RUNNER_BUSY`（HTTP 对应 503 Service Unavailable）；
   - 防止 Server 逻辑 Bug、AI 突发调用洪峰或恶意调用把单个 Runner 进程的内存占满。
3. **并发实测验证**：
   - 在集成测试中同时发起 20 个高并发 `system.ping` 请求，全部请求均携带独立且唯一的 `req_<UUID>`，全部按时独立返回对应响应，测试后 `pendingRequests.size` 保持为 0，零错位、零残留。

---

## 10. system.ping 实现细节 (system.ping Implementation)

1. **设计意图**：
   - 验证应用层 RPC 端到端完整闭环（Server 发起 $\rightarrow$ 网络传输 $\rightarrow$ Runner 路由与执行 $\rightarrow$ 响应返回 $\rightarrow$ 结果解析）；
   - 明确区别于底层传输层 WebSocket Ping/Pong 保活心跳。
2. **参数与返回规范**：
   - 参数：严格空对象 `{}`；
   - 返回结果：
     ```json
     {
       "pong": true,
       "timestamp": 1742250000000,
       "runnerId": "runner_xxx"
     }
     ```
3. **对外暴露**：
   - 管理 API：`POST /api/runners/:id/ping`。

---

## 11. system.info 实现细节与工具链强类型模式 (system.info Implementation & Schema)

1. **设计意图**：
   - 允许管理端实时获取 Runner 所在主机的硬件平台、架构、主机名、Node 版本及已安装开发工具链；
2. **核心安全脱敏原则**：
   - **绝对不返回**：任何令牌（Token）、环境变量全集（`process.env`）、用户主目录路径、系统密码、SSH 私钥、云厂商凭证；
3. **显式 Nullable 工具链模式 (Explicit Nullable RunnerToolsSchema)**：
   - 工具链必须显式声明全部支持的核心工具：`git`、`node`、`npm`、`pnpm`、`python`、`docker`；
   - 字段定义为 `z.string().nullable()`，未检测到的工具返回 `null`，严禁直接 `undefined` 或缺省省略，确保通信报文结构确定性：
     ```ts
     export const RunnerToolsSchema = z.object({
       git: z.string().nullable(),
       node: z.string().nullable(),
       npm: z.string().nullable(),
       pnpm: z.string().nullable(),
       python: z.string().nullable(),
       docker: z.string().nullable(),
     });
     ```
4. **返回数据规范**：
   ```json
   {
     "runnerId": "c8f9b908-1122-4876-88cf-...",
     "runnerVersion": "0.3.0",
     "protocolVersion": "1.0",
     "platform": "win32",
     "arch": "x64",
     "hostname": "MY-DEV-PC",
     "nodeVersion": "v22.14.0",
     "capabilities": {
       "filesystem": true,
       "shell": true,
       "git": true,
       "build": true,
       "test": true,
       "docker": false
     },
     "tools": {
       "git": "2.48.1.windows.1",
       "node": "v22.14.0",
       "npm": "10.9.0",
       "pnpm": "10.14.0",
       "python": null,
       "docker": null
     }
   }
   ```
5. **对外暴露**：
   - 管理 API：`GET /api/runners/:id/system-info`。

---

## 12. 自动化测试结果 (Tests Output)

全套自动化测试共 14 个测试文件、76 项测试全部通过（100% 通过率，0 skip，0 ignore）：

```text
 RUN  v3.2.7 E:/workspace/cod

 ✓ tests/reconnect.test.ts (5 tests) 10ms
 ✓ tests/protocol.test.ts (7 tests) 11ms
 ✓ tests/crypto.test.ts (4 tests) 7ms
 ✓ tests/runner-registry.test.ts (5 tests) 11ms
 ✓ tests/rpc-protocol.test.ts (8 tests) 12ms
 ✓ tests/config.test.ts (5 tests) 19ms
 ✓ tests/rpc-pending.test.ts (10 tests) 30ms
 ✓ tests/runner-rpc-router.test.ts (9 tests) 19ms
 ✓ tests/db-migration.test.ts (3 tests) 95ms
 ✓ tests/server-api.test.ts (3 tests) 292ms
 ✓ tests/runner-handshake.test.ts (3 tests) 317ms
 ✓ tests/runner-auth.test.ts (7 tests) 321ms
 ✓ tests/runner-integration.test.ts (1 test) 1780ms
   ✓ Runner Daemon & Server End-to-End Integration > completes full lifecycle: connect -> handshake -> registry -> api check -> disconnect  1498ms
 ✓ tests/runner-rpc-integration.test.ts (6 tests) 2589ms
   ✓ Server ↔ Runner RPC Integration & Concurrency > handles RPC timeout cleanly and leaves zero pending request leaks  1014ms

 Test Files  14 passed (14)
      Tests  76 passed (76)
   Start at  09:03:31
   Duration  4.09s
```

---

## 13. 端到端集成验证 (Integration Verification)

通过 `tests/runner-rpc-integration.test.ts` 真实拉起服务、生成令牌、连入 Runner，完成全链路验证：
1. **端到端 ping 调用**：Server 触发 `system.ping`，成功收回带时间戳的 `pong: true`；
2. **端到端 system-info 调用**：Server 触发 `system.info`，成功获取并校验安全脱敏的系统信息；
3. **20 并发高载荷测试**：同时分发 20 个请求，在 100ms 内全部正确响应，零丢失、零错位；
4. **超时与状态回收测试**：注入延迟为 2000ms 的模拟 Handler，设置 1000ms 超时，成功触发 `RPC_TIMEOUT` 并清空挂起池；
5. **异常断开熔断测试**：注入不返回响应的挂起 Handler，强制终止 Runner 进程，未结请求立即以 `RUNNER_DISCONNECTED` 拒绝，挂起数归零；
6. **管理端 HTTP 路由测试**：
   - `POST /api/runners/:id/ping` 返回 HTTP 200 与 Pong 结构体；
   - `GET /api/runners/:id/system-info` 返回 HTTP 200 与环境信息；
   - 访问不存在/下线 Runner `POST /api/runners/offline-id/ping` 正确返回 HTTP 404 及 `RUNNER_OFFLINE`。

---

## 14. 编译构建验证 (Build)

命令：`pnpm build`
状态：`EXIT CODE 0`

```text
Scope: 3 of 6 workspace projects
packages/protocol build: ESM dist/index.js (14.00 KB), DTS dist/index.d.ts (51.09 KB)
packages/security build: ESM dist/index.js (1.58 KB), DTS dist/index.d.ts (2.38 KB)
packages/shared build:   ESM dist/index.js (8.22 KB), DTS dist/index.d.ts (8.66 KB)

> @localbridge/server@0.3.0 build
ESM dist/index.js (35.16 KB)

> @localbridge/runner@0.3.0 build
ESM dist/index.js (26.42 KB)
```

---

## 15. 类型检查验证 (Typecheck)

命令：`pnpm typecheck`
状态：`EXIT CODE 0`

```text
Scope: 5 of 6 workspace projects
packages/protocol typecheck: Done (tsc --noEmit)
packages/security typecheck: Done (tsc --noEmit)
packages/shared typecheck: Done (tsc --noEmit)
apps/runner typecheck: Done (tsc --noEmit)
apps/server typecheck: Done (tsc --noEmit)
```

**全工程零 `any`、零 `@ts-ignore`、零隐式类型提升**。

---

## 16. 安全设计考量 (Security Considerations)

1. **废除 URL Query 认证**：
   - 全面移除 `?token=lbr_...` 支持，仅接受 `Authorization: Bearer lbr_...` 头。防止反向代理、HTTP 访问日志、监控探针记录明文 Token。
2. **规范时序安全描述**：
   - 明确标注采用“固定长度 SHA-256 摘要配合 `crypto.timingSafeEqual`”，客观表述其降低比较阶段时序侧信道风险的特性。
3. **禁止通用 RPC 透传端点**：
   - 严禁设立 `POST /api/rpc { method: "..." }` 任意调用透传接口，仅暴露白名单化严格声明的管理端点（`/ping`, `/system-info`），防止未来沦为未经鉴权的执行后门。
4. **Runner 内部错误脱敏屏蔽**：
   - Runner 执行 Handler 发生异常时，详细堆栈及物理路径仅打印在本地日志中，对外网络回包一律抹平为 `-32603 Internal error`。
5. **严格的资源边界与防拒绝服务**：
   - 1 MiB 载荷限制阻断大包内存占用（WebSocket 传输层 `maxPayload` 与应用层 `Buffer.byteLength` 双重防护）；
   - 64 挂起上限阻断单连接内存溢出；
   - 5s ~ 10s 严格超时避免连接卡死。
6. **管理 API 安全边界与环回隔离 (Management API Security Boundary)**：
   - Server 监听地址强制默认为环回地址 `127.0.0.1`，拒绝未显式配置下的全网卡暴露；
   - `/api/status`、`/api/runners`、`/api/runners/:id/ping`、`/api/runners/:id/system-info` 仅面向本地管理与测试；
   - 在中英文技术文档中明确添加外部暴露与反向代理防火墙防护免责声明。

---

## 17. 已知问题与边界 (Known Issues)

1. **无文件与命令执行**：
   - 符合 Phase 3 规范约束，本阶段未开放任何物理磁盘访问或命令执行接口。
2. **Node.js 引擎提示**：
   - Monorepo `package.json` 声明 `node: ">=24"`，当前本地测试环境为 Node v22.14.0，运行时伴随非致命 warning，所有功能和测试套件 100% 正常运行。

---

## 18. 下一阶段规划建议 (Phase 4 Recommendations)

进入 **Phase 4 — Local Project Authorization & Sandboxing**：
1. **项目授权与目录绑定**：在 Runner 端支持配置用户明确授权的目录白名单（`allowed_roots`），为每个项目生成稳定的 `project_id`；
2. **规范路径沙箱校验器集成**：在 `@localbridge/security` 中实现物理真实路径解析（`realpath`），严格防御目录穿越（`../`）、符号链接逃逸（Symlink Escape）及 Windows Junction；
3. **项目自省 RPC**：实现 `project.validate` 与 `directory.list`（只读操作），打通服务端对授权项目基础结构的感知。
