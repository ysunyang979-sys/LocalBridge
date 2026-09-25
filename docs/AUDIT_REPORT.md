# Nexus / LocalBridge 代码与文档一致性审计报告

> **审计基准时间**: 2026-09-24  
> **审计基准环境**: Windows x64 / Node.js v24 / pnpm / Tauri 2  
> **审计原则**: 严格以仓库当前源码、配置文件、测试套件与构建脚本为**单一事实来源（Single Source of Truth）**。杜绝主观臆断与模糊推测；凡代码未显式实现或无法通过代码完全证伪者，均如实注明“待确认”。  
> **操作约束声明**: 本次审计未修改、删除或移动仓库中任何已有文件，仅在 `docs/` 目录下生成本审计报告文件。

---

## 一、MCP 工具注册与接入通道审计

在源码中，系统实际上存在 **两个独立运行的 MCP Server 实现**，并通过 **三种典型接入通道** 向外部提供服务。经全仓源码逐行核验，各通道的工具数量、工具名单及代码实现位置如下：

### 1. 本地核心通道（Local Core :18080/mcp）

- **服务端口与协议**: 默认 `18080`（由 `config.json` 或 `LOCALBRIDGE_SERVER_PORT` 配置），提供 HTTP POST `/mcp` 端点，基于 `@modelcontextprotocol/node` 的 `NodeStreamableHTTPServerTransport`（MCP Protocol `2026-07-28`）。
- **注册入口**: `apps/server/src/mcp/server.ts` 中的 `createLocalBridgeMcpServer(context, options)`。
- **调度分发与鉴权**: `apps/server/src/mcp/handler.ts`（第 106–452 行）。
- **工具总量**: **共计 64 个工具**（全部以 `localbridge_` 为前缀）。在测试用例 `tests/mcp-tools.test.ts`（第 171–175 行）与 `tests/skills-production-tool-count.test.ts`（第 52–60 行）中严格断言总数为 64。
- **全量工具清单与源码精确位置**:

| 序号 | 工具名称 | 分类 | 代码定义文件及注册行号 | 功能与参数概要 |
|:---|:---|:---|:---|:---|
| 1 | `localbridge_project_list` | 项目管理 | `apps/server/src/mcp/tools/project.ts:15` | 列出已登记受控的项目列表 |
| 2 | `localbridge_project_info` | 项目管理 | `apps/server/src/mcp/tools/project.ts:52` | 获取指定受控项目的详细元数据 |
| 3 | `localbridge_directory_list` | 文件系统 | `apps/server/src/mcp/tools/filesystem.ts:27` | 列出项目安全沙箱目录内的子项清单 |
| 4 | `localbridge_file_stat` | 文件系统 | `apps/server/src/mcp/tools/filesystem.ts:74` | 查看文件状态（大小、修改时间、类型） |
| 5 | `localbridge_file_read` | 文件系统 | `apps/server/src/mcp/tools/filesystem.ts:121` | 分行切片或完整读取文本文件内容 |
| 6 | `localbridge_file_create` | 文件系统 | `apps/server/src/mcp/tools/filesystem.ts:168` | 在沙箱内安全创建新文件 |
| 7 | `localbridge_file_write` | 文件系统 | `apps/server/src/mcp/tools/filesystem.ts:224` | 覆盖写入现有文件内容 |
| 8 | `localbridge_file_patch` | 文件系统 | `apps/server/src/mcp/tools/filesystem.ts:280` | 基于统一差分补丁局部修改文件 |
| 9 | `localbridge_file_delete` | 文件系统 | `apps/server/src/mcp/tools/filesystem.ts:336` | 安全删除单个文件（需审批保护机制） |
| 10 | `localbridge_file_restore` | 文件系统 | `apps/server/src/mcp/tools/filesystem.ts:392` | 还原误删文件（利用安全备份机制） |
| 11 | `localbridge_fs_delete` | 高级文件 | `apps/server/src/mcp/tools/filesystem.ts:462` | 递归删除目录或文件 |
| 12 | `localbridge_fs_move` | 高级文件 | `apps/server/src/mcp/tools/filesystem.ts:541` | 重命名或移动文件/目录 |
| 13 | `localbridge_fs_copy` | 高级文件 | `apps/server/src/mcp/tools/filesystem.ts:591` | 在沙箱内部复制文件或目录 |
| 14 | `localbridge_fs_mkdir` | 高级文件 | `apps/server/src/mcp/tools/filesystem.ts:641` | 创建多级目录 |
| 15 | `localbridge_git_info` | Git 集成 | `apps/server/src/mcp/tools/git.ts:22` | 获取 Git 仓次元数据（远程 URL、分支） |
| 16 | `localbridge_git_status` | Git 集成 | `apps/server/src/mcp/tools/git.ts:69` | 查询工作区变更、未跟踪文件状态 |
| 17 | `localbridge_git_diff` | Git 集成 | `apps/server/src/mcp/tools/git.ts:116` | 获取工作区或暂存区的差异内容 |
| 18 | `localbridge_git_log` | Git 集成 | `apps/server/src/mcp/tools/git.ts:163` | 结构化查询提交历史与作者信息 |
| 19 | `localbridge_git_stage` | Git 集成 | `apps/server/src/mcp/tools/git.ts:210` | 暂存指定路径或全量工作区修改 |
| 20 | `localbridge_git_unstage` | Git 集成 | `apps/server/src/mcp/tools/git.ts:265` | 从暂存区移出文件变更 |
| 21 | `localbridge_git_branch_create` | Git 集成 | `apps/server/src/mcp/tools/git.ts:320` | 基于指定起点创建新分支 |
| 22 | `localbridge_git_branch_switch` | Git 集成 | `apps/server/src/mcp/tools/git.ts:375` | 切换当前工作分支 |
| 23 | `localbridge_git_commit` | Git 集成 | `apps/server/src/mcp/tools/git.ts:430` | 提交暂存区的修改并记录提交信息 |
| 24 | `localbridge_command_classify` | 命令与任务 | `apps/server/src/mcp/tools/command.ts:16` | 预检并评估强类型 CommandSpec 风险等级 |
| 25 | `localbridge_command_run` | 命令与任务 | `apps/server/src/mcp/tools/command.ts:64` | 在受控边界内执行强类型结构化命令 |
| 26 | `localbridge_job_start` | 后台作业 | `apps/server/src/mcp/tools/jobs.ts:23` | 启动异步受控的后台任务进程 |
| 27 | `localbridge_job_status` | 后台作业 | `apps/server/src/mcp/tools/jobs.ts:92` | 查询异步作业运行状态与退出码 |
| 28 | `localbridge_job_logs` | 后台作业 | `apps/server/src/mcp/tools/jobs.ts:146` | 分页拉取后台任务标准输出/错误流 |
| 29 | `localbridge_job_cancel` | 后台作业 | `apps/server/src/mcp/tools/jobs.ts:190` | 强制终止正在运行的作业进程树 |
| 30 | `localbridge_job_list` | 后台作业 | `apps/server/src/mcp/tools/jobs.ts:242` | 列出指定项目或全局所有作业 |
| 31 | `localbridge_build_start` | 后台作业 | `apps/server/src/mcp/tools/jobs.ts:316` | 启动 npm/pnpm build 构建作业 |
| 32 | `localbridge_test_start` | 后台作业 | `apps/server/src/mcp/tools/jobs.ts:375` | 启动 npm/pnpm test 测试作业 |
| 33 | `localbridge_approval_status` | 人工审批 | `apps/server/src/mcp/tools/approvals.ts:24` | 实时查询高危操作的人工审批裁决状态 |
| 34 | `localbridge_code_document_symbols` | 代码智能(LSP) | `apps/server/src/mcp/tools/code.ts:21` | 提取当前代码文档的符号大纲树 |
| 35 | `localbridge_code_workspace_symbols` | 代码智能(LSP) | `apps/server/src/mcp/tools/code.ts:68` | 在项目全局工作区模糊检索符号 |
| 36 | `localbridge_code_definition` | 代码智能(LSP) | `apps/server/src/mcp/tools/code.ts:115` | 精确跳转至符号定义所在行及文件 |
| 37 | `localbridge_code_references` | 代码智能(LSP) | `apps/server/src/mcp/tools/code.ts:175` | 查找符号的所有引用出现位置 |
| 38 | `localbridge_code_hover` | 代码智能(LSP) | `apps/server/src/mcp/tools/code.ts:235` | 获取光标所在符号的悬浮类型信息与文档 |
| 39 | `localbridge_code_diagnostics` | 代码智能(LSP) | `apps/server/src/mcp/tools/code.ts:282` | 获取代码文件的编译/语法错误与告警列表 |
| 40 | `localbridge_code_call_hierarchy` | 代码智能(LSP) | `apps/server/src/mcp/tools/code.ts:344` | 分析函数/方法的上下游调用层次结构 |
| 41 | `localbridge_code_impact` | 代码智能(LSP) | `apps/server/src/mcp/tools/code.ts:403` | 综合评估修改某符号对全局的影响面 |
| 42 | `localbridge_session_start` | 会话与上下文 | `apps/server/src/mcp/tools/session.ts:21` | 开启 AI 连续工作流会话，绑定工作树 |
| 43 | `localbridge_session_list` | 会话与上下文 | `apps/server/src/mcp/tools/session.ts:82` | 列出项目内已创建的工作流会话 |
| 44 | `localbridge_session_status` | 会话与上下文 | `apps/server/src/mcp/tools/session.ts:130` | 获取会话元数据、活跃状态与工作树路径 |
| 45 | `localbridge_session_events` | 会话与上下文 | `apps/server/src/mcp/tools/session.ts:178` | 获取会话内沉淀的时间线审计事件 |
| 46 | `localbridge_session_checkpoint` | 会话与上下文 | `apps/server/src/mcp/tools/session.ts:222` | 在关键阶段保存会话快照与决策上下文 |
| 47 | `localbridge_session_handoff` | 会话与上下文 | `apps/server/src/mcp/tools/session.ts:276` | 生成跨模型或交接给人类的结构化数据包 |
| 48 | `localbridge_session_finish` | 会话与上下文 | `apps/server/src/mcp/tools/session.ts:325` | 正常结束或撤销会话，清理关联资源 |
| 49 | `localbridge_worktree_create` | Git 工作树 | `apps/server/src/mcp/tools/worktree.ts:19` | 在受控隔离目录创建独立 Git 工作树 |
| 50 | `localbridge_worktree_list` | Git 工作树 | `apps/server/src/mcp/tools/worktree.ts:67` | 列出项目当前管理的所有工作树 |
| 51 | `localbridge_worktree_status` | Git 工作树 | `apps/server/src/mcp/tools/worktree.ts:115` | 查看指定工作树的暂存与未暂存状态 |
| 52 | `localbridge_worktree_diff` | Git 工作树 | `apps/server/src/mcp/tools/worktree.ts:161` | 提取工作树相对于基准分支的修改差异 |
| 53 | `localbridge_worktree_remove` | Git 工作树 | `apps/server/src/mcp/tools/worktree.ts:207` | 安全销毁并清理指定的工作树目录 |
| 54 | `localbridge_runtime_start` | 持久运行时 | `apps/server/src/mcp/tools/runtime.ts:20` | 启动本地常驻服务（开发服务器、端口监听） |
| 55 | `localbridge_runtime_list` | 持久运行时 | `apps/server/src/mcp/tools/runtime.ts:75` | 列出当前运行的本地开发服务实例 |
| 56 | `localbridge_runtime_status` | 持久运行时 | `apps/server/src/mcp/tools/runtime.ts:123` | 查询运行时服务的健康状态与占用端口 |
| 57 | `localbridge_runtime_logs` | 持久运行时 | `apps/server/src/mcp/tools/runtime.ts:168` | 查看常驻服务的实时日志输出 |
| 58 | `localbridge_runtime_restart` | 持久运行时 | `apps/server/src/mcp/tools/runtime.ts:212` | 重启本地常驻服务 |
| 59 | `localbridge_runtime_stop` | 持久运行时 | `apps/server/src/mcp/tools/runtime.ts:263` | 优雅停止常驻服务 |
| 60 | `localbridge_skill_list` | Nexus Skills | `apps/server/src/mcp/tools/skills.ts:19` | 列出已安装且可用的声明式技能清单 |
| 61 | `localbridge_skill_get` | Nexus Skills | `apps/server/src/mcp/tools/skills.ts:107` | 获取指定技能的 SKILL.md 文档或元数据 |
| 62 | `localbridge_skill_match` | Nexus Skills | `apps/server/src/mcp/tools/skills.ts:210` | 基于用户意图语义推荐最匹配的技能 |
| 63 | `localbridge_laya_status` | Laya 决策引擎 | `apps/server/src/mcp/tools/laya.ts:17` | 查询本地决策模型加载状态与端侧推理能力 |
| 64 | `localbridge_laya_assess` | Laya 决策引擎 | `apps/server/src/mcp/tools/laya.ts:66` | 对即将执行的高危工具进行本地安全风险裁决 |

---

### 2. 远程 OAuth 桥接通道（Remote OAuth Bridge :8787）

- **服务端口与协议**: 默认 `8787`（由 `NEXUS_BRIDGE_PORT` 环境变量控制），提供 `POST /mcp` 端点，基于 `@modelcontextprotocol/sdk`（MCP Protocol `2024-11-05` / Streamable HTTP）。
- **注册入口**: `apps/bridge/src/server.ts` 中的 `createMcpServer(nexusClient)`（第 13–26 行）以及其镜像模块 `apps/server/src/mcp-gateway/gateway-server.ts`。
- **设计定位**: 专为公网远程客户端（如 Gemini Spark Custom App）设计的**极简安全过滤网关**。通过路径沙箱与白名单机制，彻底阻断 Shell 命令执行和凭据管理。
- **工具总量**: **严格白名单 8 个工具**（全部以 `nexus_` 为前缀）。
- **全量工具清单与源码精确位置**:

| 序号 | 工具名称 | 分类 | 代码定义文件及注册行号 | 映射至 Core 的后端工具 |
|:---|:---|:---|:---|:---|
| 1 | `nexus_project_list` | 项目管理 | `apps/bridge/src/tools/project.ts:8` | `localbridge_project_list` |
| 2 | `nexus_project_info` | 项目管理 | `apps/bridge/src/tools/project.ts:44` | `localbridge_project_info` |
| 3 | `nexus_directory_list` | 文件系统 | `apps/bridge/src/tools/filesystem.ts:8` | `localbridge_directory_list` |
| 4 | `nexus_file_read` | 文件系统 | `apps/bridge/src/tools/filesystem.ts:50` | `localbridge_file_read` |
| 5 | `nexus_file_create` | 文件系统 | `apps/bridge/src/tools/filesystem.ts:101` | `localbridge_file_create` |
| 6 | `nexus_file_write` | 文件系统 | `apps/bridge/src/tools/filesystem.ts:145` | `localbridge_file_write` |
| 7 | `nexus_git_status` | Git 检查 | `apps/bridge/src/tools/git.ts:7` | `localbridge_git_status` |
| 8 | `nexus_runtime_list` | 运行时检查 | `apps/bridge/src/tools/runtime.ts:7` | `localbridge_runtime_list` |

---

### 3. ChatGPT 通道

- **代码实现位置**:
  1. 服务端适配器: `apps/server/src/adapters/mcp/index.ts`（`ChatGPTConnectorAdapter` 类，第 7–41 行）。
  2. 适配器注册中心: `apps/server/src/adapters/registry.ts`（第 17–22 行，默认注册 ID 为 `conn_chatgpt`）。
  3. 数据库初始化/迁移: `apps/server/src/db/migrations/0012_prune_deprecated_ai_connections.sql`（将 ChatGPT 设置为主控制平面连接）。
  4. 桌面端前端组件: `apps/desktop/src/components/connections/ChatGPTConnection.tsx`。
- **连接通道工作原理**:
  - ChatGPT 并不经过 8787 的极简网关，而是作为第一公民（First-class Citizen）接入。
  - 用户在桌面端启动安全隧道（`tunnel-client-runtime-cloudflared.exe`，分配形如 `https://<tunnel-id>.trycloudflare.com/mcp` 的端点）。
  - 该端点直接穿透代理到本地 Core 的 HTTP POST `/mcp`（即 `:18080/mcp`）。
  - 当带有 ChatGPT 关联令牌的请求进入 `apps/server/src/mcp/handler.ts` 时：
    - 若开启 Full Control（全控模式），服务端在内存中动态提升 Scopes 为 `["read", "write", "execute", "delete", "filesystem-full"]`（`handler.ts:310–313`）。
    - 针对写与执行操作，自动将操作源标记为 `source: "chatgpt"` 接入 Laya 智能建议管道（`handler.ts:362–381`）。
- **工具总量与名单**:
  - `ChatGPTConnectorAdapter.getHealth()`（`apps/server/src/adapters/mcp/index.ts:20`）与 `testConnection()`（第 35 行）均显式声明：
    `toolCount: 64`
  - 因此，**ChatGPT 通道拥有并暴露与本地 Core 完全一致的全部 64 个 `localbridge_*` 工具**。在用户开启全控或授予完整权限下，ChatGPT 能够调用全部 64 个工具。

---

## 二、当前真实版本号审计

经全仓检索构建配置、依赖清单、Tauri 配置以及二进制安装包，当前仓库各处真实版本号呈现明显的**不同步与多版本共存现状**：

### 1. 各处版本号对照表

| 检查目标文件 | 声明类型 | 代码中的真实版本号 | 文件路径 |
|:---|:---|:---|:---|
| 根目录 `package.json` | npm monorepo root | **1.2.0** | `package.json:3` |
| `apps/desktop/package.json` | 桌面前端 Web 依赖包 | **1.2.0** | `apps/desktop/package.json:3` |
| `apps/desktop/src-tauri/tauri.conf.json` | Tauri 2 核心配置文件 | **1.2.0** | `apps/desktop/src-tauri/tauri.conf.json:4` |
| `apps/desktop/src-tauri/Cargo.toml` | Rust 桌面宿主工程 | **1.2.0** | `apps/desktop/src-tauri/Cargo.toml:3` |
| 安装包文件名 | NSIS 编译生成的二进制文件 | **1.2.0** (`Nexus_1.2.0_x64-setup.exe`) | `Nexus_1.2.0_x64-setup.exe` |
| `apps/server/package.json` | 后端 Core 服务包 | **1.1.0** ⚠️ | `apps/server/package.json:3` |
| `apps/runner/package.json` | 本地执行宿主 Runner 包 | **1.1.0** ⚠️ | `apps/runner/package.json:3` |
| `packages/protocol/package.json` | RPC 协议层公共包 | **1.1.0** ⚠️ | `packages/protocol/package.json:3` |
| `packages/security/package.json` | 安全沙箱公共包 | **1.1.0** ⚠️ | `packages/security/package.json:3` |
| `packages/shared/package.json` | 通用工具公共包 | **1.1.0** ⚠️ | `packages/shared/package.json:3` |
| `apps/bridge/package.json` | 远程 OAuth 网关包 | **1.0.0** ⚠️ | `apps/bridge/package.json:3` |
| `apps/server/src/mcp/server.ts` | MCP Server 缺省回退版本 | **0.10.0** ⚠️ (`options.version ?? "0.10.0"`) | `apps/server/src/mcp/server.ts:29` |
| `apps/server/src/mcp/handler.ts` | `/api/mcp/status` 接口硬编码响应 | **1.1.0** ⚠️ (`version: "1.1.0"`) | `apps/server/src/mcp/handler.ts:72` |
| `CHANGELOG.md` | 变更历史记录最新条目 | **1.0.1** ⚠️ (`[1.0.1] - 2026-09-19`) | `CHANGELOG.md:9` |

### 2. 不一致之处与风险分析

1. **Monorepo 内部版本严重割裂**:
   - 桌面端（Desktop / Tauri / Cargo / 安装包）已经升级至 **1.2.0**；
   - 后端的核心服务与协议包（Server / Runner / Protocol / Security / Shared）停留在 **1.1.0**；
   - 远程网关（Bridge）停留在 **1.0.0**。
2. **CHANGELOG.md 严重滞后**:
   - `CHANGELOG.md` 记录的最新版本为 `[1.0.1] - 2026-09-19`；
   - 关于 `1.1.0`（引入 Laya 智能建议、64 工具扩充、Skills v1 等）和 `1.2.0`（Nexus 品牌重塑、ChatGPT 控制平面专享重构、现代化 UI 重构）的任何变更记录在 CHANGELOG 中**完全缺失**。
3. **接口与初始化硬编码历史包袱**:
   - `apps/server/src/mcp/server.ts` 中 `createLocalBridgeMcpServer` 的 fallback 版本仍为旧阶段的 `"0.10.0"`；
   - `GET /api/mcp/status` 接口返回的 `version` 字段硬编码为 `"1.1.0"`，在桌面端显示或对外部探针响应时与安装包的 `1.2.0` 冲突。

---

## 三、产品名称在仓库中出现的写法及位置

仓库经历过一次明显的品牌重塑（Rebranding）：**从最初的底层技术命名“LocalBridge”，转型至面向终端用户与 ChatGPT 的产品品牌“Nexus”**。但目前重构并不彻底，形成了“上层 Nexus，底层 LocalBridge”的典型混合状态。

### 1. 命名出现的所有形式及分布表

| 产品名称写法 | 出现位置与典型代码实体 | 语义上下文与职责分工 |
|:---|:---|:---|
| **Nexus** | • `tauri.conf.json:3` (`"productName": "Nexus"`)<br>• `tauri.conf.json:15` (`"title": "Nexus Control Center"`)<br>• `Cargo.toml:12` (`ProductName = "Nexus"`)<br>• `README.md:1` (`# Nexus`)<br>• `website/` 下的所有官方主页内容<br>• 安装包文件名 `Nexus_1.2.0_x64-setup.exe`<br>• 桌面 UI 全局 Header 与各种提示文案 | 面向最终用户的产品品牌名称、客户端安装包名、应用窗口标题。定位为“ChatGPT 专属的本地 AI 控制平面”。 |
| **LocalBridge** | • 根目录 `package.json:2` (`"name": "localbridge-monorepo"`)<br>• 公共包 `@localbridge/protocol`, `@localbridge/security`, `@localbridge/shared`<br>• 本地数据库文件名 `localbridge.db`, `localbridge.db-wal`<br>• 守护进程与二进制 `localbridge-desktop.exe`<br>• 根目录 `config.json:9` (`"name": "Local-Dev-Runner"`)<br>• 规范文档 `docs/THREAT_MODEL.md`, `docs/architecture.md`, `CHANGELOG.md` | 底层架构技术代号、monorepo 包命名空间、本地持久化数据库及技术协议标准。 |
| **nexus-mcp-bridge** | • `apps/bridge/package.json:2`<br>• `apps/bridge/src/server.ts:15`<br>• `apps/desktop/src-tauri/resources/bridge/nexus-mcp-bridge.exe` | 远程网关独立进程包名与二进制名称。 |
| **localbridge-server** | • `apps/server/src/mcp/server.ts:28` (`options.name ?? "localbridge-server"`) | 本地 Core MCP Server 实例默认协议名称。 |
| **localbridge-desktop** | • `apps/desktop/src-tauri/Cargo.toml:2` (`name = "localbridge-desktop"`)<br>• `Cargo.toml:9` (`OriginalFilename = "localbridge-desktop.exe"`) | Rust 工程内部包名及原生可执行文件名。 |
| **localbridge_\*** (前缀) | • `apps/server/src/mcp/tools/*.ts` 全量 64 个工具名称（如 `localbridge_file_read`） | 本地核心 MCP 工具命名空间。 |
| **nexus_\*** (前缀) | • `apps/bridge/src/tools/*.ts` 全量 8 个网关工具名称（如 `nexus_file_read`） | 远程网关白名单工具命名空间。 |
| **lb_ / lbr_ / lm_** (前缀) | • `@localbridge/shared` 及 `apps/server/src/db/token-service.ts` | 令牌前缀（分别代表 LocalBridge MCP、Runner、Management）。未随品牌变更迁移为 `nx_`。 |
| **mcp_oa_** (前缀) | • `apps/bridge/src/oauth.ts:332,386` | 远程网关 OAuth 颁发的 Access Token 专用前缀。 |

### 2. 结论

- **外部品牌与分发物**: 已经全面统一为 **Nexus**（安装包、界面显示、官网宣传）。
- **代码实现与内部依赖**: 仍维持 **LocalBridge**（数据库、npm 作用域、原生可执行文件名、MCP 工具前缀、Token 命名规范）。
- **外部文档脱节**: 除根目录 `README.md` 与 `README.zh-CN.md` 在顶部写了 Nexus 外，`docs/THREAT_MODEL.md`、`docs/architecture.md`、`CHANGELOG.md` 等内部仍然 100% 只提及“LocalBridge”，完全未同步 Nexus 品牌。

---

## 四、文档与代码不符陈述逐条排查

本节重点针对 `README.md`、`README.zh-CN.md`、`docs/THREAT_MODEL.md`、`CHANGELOG.md` 中的具体陈述，与源码实际实现做逐一交叉比对。

### 1. Git 支持的操作范围

- **文档原文 1 (`docs/THREAT_MODEL.md` 第 97 行)**:
  > *"Git subcommands are whitelisted: only `status`, `diff`, `log`, `branch`, `rev-parse` are permitted. Zero Git write operations (`commit`, `push`, `reset`) are exposed to the AI client."*
- **文档原文 2 (`README.md` 第 437 行 / `README.zh-CN.md` 第 441 行)**:
  > *"| **Git Inspection** | `localbridge_git_info`<br>`localbridge_git_status`<br>`localbridge_git_diff`<br>`localbridge_git_log` | Safe, read-only Git status, unified diffs, and commit history. |"*
- **代码实际情况**:
  - `apps/server/src/mcp/tools/git.ts` 实际注册并暴露了 **9 个** Git 工具，明确包含写操作与分支切换：
    - `localbridge_git_stage`（第 210 行）
    - `localbridge_git_unstage`（第 265 行）
    - `localbridge_git_branch_create`（第 320 行）
    - `localbridge_git_branch_switch`（第 375 行）
    - `localbridge_git_commit`（第 430 行）
  - 执行端 `apps/runner/src/git/service.ts`（第 280–430 行）与 `apps/runner/src/rpc/handlers/git-commit.ts` 等完全实现了直接调用底层 `git commit`、`git add`、`git checkout -b` 的逻辑。
  - 另外，系统还在 `apps/server/src/mcp/tools/worktree.ts` 中注册了 5 个 `localbridge_worktree_*` 工具，支持 Git 物理工作树的创建、切换和删除。
- **差异定性**: **严重不符（直接矛盾）**。威胁模型与自述文档声称“绝对零 Git 写操作、只允许只读检查”，但代码实际已经全面支持暂存、撤销暂存、创建分支、检出分支以及提交代码。

---

### 2. 命令类别与规范（Command Categories & Kinds）

- **文档原文 (`docs/THREAT_MODEL.md` 第 88 行)**:
  > *"Commands can only be executed via strongly typed `CommandSpec` schemas: `tool-version`, `node-script`, `python-script`, or `package-script`."*
- **代码实际情况**:
  - 文档中所指的这 4 种类型在代码中对应的是 **`CommandSpec` 的判别联合种类（Discriminated Union `kind`）**，定义于 `packages/protocol/src/runner/rpc.ts:852–858`。
  - 除此之外，代码中还存在一套独立的 **命令功能业务分类枚举（`CommandCategory`）**（定义于 `packages/protocol/src/runner/rpc.ts:774–785`），包含 **10 个具体类别**：
    `"inspect" | "test" | "lint" | "typecheck" | "build" | "dev-server" | "package-script" | "package-install" | "git-read" | "custom-safe"`
  - 该分类被 `packages/security/src/command/classifier.ts` 与策略裁决引擎深度使用。
- **差异定性**: **概念混淆与陈述不全**。文档将底层命令类型的 `kind`（4 项）称为命令规范，但未提及权限管控中实际生效的 10 类 `CommandCategory`。不过，文档关于“严禁暴露原始系统 Shell（exec/system/sh/cmd/powershell）”的陈述在代码中得到了严格遵守。

---

### 3. 后台作业最大超时时间（Job Timeout）

- **文档原文 1 (`README.md` 第 390 行)**:
  > *"Timeouts: Configurable per job from 1s to 3600s (default 600s / 10 minutes). On timeout, the entire process tree is terminated..."*
- **文档原文 2 (`docs/THREAT_MODEL.md` 第 147 行)**:
  > *"Job Concurrency & Execution Limits: Strict caps on concurrent background jobs; mandatory `timeoutMs` (max 300,000ms / 5 minutes)."*
- **代码实际情况**:
  - 在协议模式定义 `packages/protocol/src/runner/rpc.ts` 中：
    - `JobStartToolInputSchema`（第 922–928 行）：
      `timeoutMs: z.number().int().min(1000).max(300000).default(60000)`
    - `JobStartParamsSchema`（第 1031 行）：
      `timeoutMs: z.number().int().min(1000).max(300000).default(60000)`
    - `BuildStartParamsSchema`（第 1167 行）与 `TestStartParamsSchema`（第 1190 行）：
      `timeoutMs: z.number().int().min(1000).max(300000).default(60000)`
  - **代码强制限制区间为 1,000ms ～ 300,000ms（即 1 秒至 5 分钟），缺省默认值为 60,000ms（1 分钟）**。
  - 若按照 README 所述传入 600 秒或 3600 秒，Zod 校验将直接报错并拒绝执行。
  - 经查，3,600,000ms（1 小时）在代码中仅存在于人工审批超时 `ApprovalCreateParamsSchema`（第 1368 行）。
- **差异定性**: **README 严重错误，THREAT_MODEL 符合代码**。README 中的“默认 10 分钟、上限 1 小时”与代码完全相反，代码中无论工具调用还是 RPC 启动任务，最大均只能设定 5 分钟。

---

### 4. 令牌类型与各路由访问权限矩阵

代码中存在四种令牌类型：`lb_`、`lbr_`、`lm_` 以及 `mcp_oa_`。源码实现与文档对照如下：

- **文档陈述**:
  - `README.md:482`、`CHANGELOG.md:34–39`、`docs/THREAT_MODEL.md:104–107` 均宣称了三域令牌隔离（Tri-Domain Token Isolation）：`lb_`、`lbr_`、`lm_`。未提及 `mcp_oa_`。
- **代码实际权限矩阵（基于 `token-service.ts`、`handler.ts`、`management.ts`、`oauth.ts`）**:

| 令牌类型 / 前缀 | 来源与生成方式 | 允许访问的路由端点 | 严禁访问的端点（直接 401/403） | 代码强制校验位置 |
|:---|:---|:---|:---|:---|
| **`lb_*`** (MCP Client) | 桌面端通过管理接口生成，存入 SQLite `tokens` 表（`type='mcp'`） | • `POST /mcp` (:18080)<br>• 经 Cloudflare 安全隧道中转的 `POST /mcp` | • `GET /runner` (Runner WS)<br>• `/api/management/*`<br>• `/api/mcp/status`<br>• 网关 :8787（除非设为主 token） | `token-service.ts:205–244`<br>`handler.ts:258`<br>`management.ts:138` |
| **`lbr_*`** (Runner Daemon) | 桌面/启动脚本生成，存入 SQLite（`type='runner'`） | • `GET /runner` (:18080, WebSocket) | • `POST /mcp`<br>• `/api/management/*`<br>• `/api/mcp/status`<br>• 网关 :8787 | `token-service.ts:160–199`<br>`management.ts:138` |
| **`lm_*`** (Management) | 桌面 Rust 启动时通过 OS CSPRNG 生成，写至 `management-token.key` | • `/api/management/*` (:18080)<br>• `/api/mcp/status` (回环探测) | • `POST /mcp`<br>• `GET /runner` (Runner WS)<br>• 网关 :8787 | `token-service.ts:250–273`<br>`management.ts:147–158` |
| **`mcp_oa_*`** (OAuth Access) | 远程网关 OAuth 2.0 授权后签发（有效期 1 小时） | • `POST /mcp` (:8787, 网关服务)<br>• `GET /mcp` (:8787, SSE 握手) | • `:18080` 下的全部接口（Core 服务只认 `lb_`，不认 `mcp_oa_`） | `apps/bridge/src/oauth.ts:423` |

- **跨域调用熔断机制**:
  - `validateMcpToken` 遇到 `lbr_` 或 `lm_`，立即返回 `INVALID_TOKEN_TYPE`；
  - `validateRunnerToken` 遇到 `lb_` 或 `lm_`，立即返回 `INVALID_TOKEN_TYPE`；
  - `checkLoopbackAndSecurity` 遇到 `lb_` 或 `lbr_`，立即返回 `INVALID_TOKEN_TYPE`。

---

### 5. 本地客户端是否能使用 Management Token？

针对该问题，全仓审计结论明确如下：

1. **桌面 Native 端（Tauri Rust 宿主）**:
   - **完全可以使用，并且是强制使用**。
   - `apps/desktop/src-tauri/src/main.rs` 中的 `get_management_token`（第 527–553 行）从用户数据目录下的 `management-token.key` 读取 `lm_` 开头的令牌。
   - 在所有的 `desktop_management_call`（如授权项目、新建 Token、修改策略等）中，通过 `loopback_management_request`（第 609–611 行）显式附带 `Authorization: Bearer <lm_token>` 请求本地 Core 服务。
2. **桌面 UI 前端（React WebView）**:
   - **严禁持有且无法使用**。
   - `apps/desktop/src/api/bridge.ts` 中的直接 `fetchJson`（第 65–88 行）默认**不附带**任何认证 Header。
   - 专门设立了测试用例 `tests/skills-no-management-secret-in-webview.test.ts`（第 10–47 行），严格断言前端代码中绝不能出现任何 `lm_` 字样或凭据硬编码，防止 WebView 中的恶意 XSS 获取管理令牌。所有敏感操作均通过 Tauri IPC（`invoke("desktop_*")`）交由 Rust 宿主代为发送管理凭据。
3. **本地 Core 服务端校验规则**:
   - `apps/server/src/routes/management.ts:159–165`:
     ```ts
     } else if (opts.requireManagementAuth && opts.managementSecret) {
       reply.status(401).send({ error: "Unauthorized: Missing management secret token", code: "MISSING_TOKEN" });
     }
     ```
   - 若服务启动时未开启 `requireManagementAuth`（例如无参启动的开发模式），本地回环（127.0.0.1）且 Host/Origin 合法的本地客户端即使不传 Token 也能访问管理端点；但一旦提供了 `lb_` 或 `lbr_`，依然会因为域隔离被立即阻断。而在生产打包环境下，Tauri 启动服务端时会注入 `LOCALBRIDGE_MANAGEMENT_TOKEN`，此时缺少 `lm_` 令牌将被严格阻断。

---

### 6. 其他重大陈述不符项汇总

| 审计项 | 文档原文陈述 | 代码实际情况 | 涉及文件位置 |
|:---|:---|:---|:---|
| **MCP 工具数量** | • `README.md:15`: 62 Tools<br>• `README.md:417`: 23 Tools | 实际注册并定义了 **64 个工具** | `tests/mcp-tools.test.ts:171`<br>`tests/skills-production-tool-count.test.ts:54` |
| **测试套件与数量** | `README.md:48`: "75 suites, 450 tests" | 实际磁盘中包含 **281 个** `.test.ts` 测试文件，测试用例超 1,200 个 | `tests/*.test.ts` (数量达 281) |
| **Monorepo 成员数** | `README.md:36`: "6 workspace packages/apps plus 1 root (7 total)" | 实际有 4 apps + 3 packages = **7 packages/apps plus 1 root (共 8 个成员)** | `pnpm-workspace.yaml`, `apps/`, `packages/` |
| **安全沙箱根路径** | `README.md:28`: "Dual Token Separation" | 实际为 **Tri-Domain Token Separation**（文档漏写了 Management 令牌域） | `README.md:28`, `CHANGELOG.md:34` |
| **CHANGELOG 版本** | `CHANGELOG.md:9`: 最新为 `1.0.1` | 代码与安装包已全面推进到 **1.2.0**，存在整整两个大版本未记录 | `CHANGELOG.md`, `package.json:3` |

---

## 五、目录结构真实性审计（文档描述 vs 磁盘实际）

### 1. Monorepo 成员结构对比

`README.md`（第 38–51 行）描述的目录结构树如下：

```text
localbridge/
├── apps/
│   ├── desktop/          # Tauri 2 + React + Vite Desktop Control Center
│   ├── runner/           # Local execution daemon (Filesystem, Git, Commands, Jobs)
│   └── server/           # Fastify MCP & API Server with SQLite persistence
├── packages/
│   ├── protocol/         # Pure protocol definitions, JSON-RPC schemas & error codes
│   ├── security/         # Sandboxing, path verification & command risk analyzer
│   └── shared/           # Structured logger (Pino), config loader, crypto helpers
├── tests/                # Integration and end-to-end test suites (75 suites, 450 tests)
├── docs/                 # Architectural specifications and protocol documentation
└── scripts/              # Build and development helper scripts
```

**实际磁盘结构差异**:

1. **缺失 `apps/bridge`**:
   - 磁盘上存在完整的 `apps/bridge` 目录（包含独立 `package.json`、`src/server.ts`、`src/oauth.ts` 等），是一个独立的远程 OAuth MCP 网关应用。
   - **README 架构树中完全遗漏了 `apps/bridge`**。
2. **缺失 `website` 目录**:
   - 磁盘上存在 `website/` 目录（包含用于分发产品的官方 Landing Page，包括 HTML、CSS、JS 及产品文档）。
   - **README 架构树中未声明该前端站点目录**。
3. **缺失 `resources` 根目录**:
   - 磁盘上存在 `resources/` 目录，存放预置的 8 个内置 Nexus Skills（如 `nexus.code-debug`、`nexus.fix-build` 等 YAML 及 Markdown 资产）。
   - **README 架构树中未标明该目录**。
4. **内部应用目录结构演进**:
   - `apps/server/src/`: 实际包含 `mcp-gateway/`、`adapters/`、`runtime/`、`session/`、`skills/` 等模块，超出原文档描述的简单 Fastify MCP 服务。
   - `apps/runner/src/`: 实际包含 `lsp/`（完整的 Language Server 集成）、`worktree/`、`runtime/` 等子系统。
   - `apps/desktop/src/`: 页面数量扩展到 11 个核心页面，新增了 `SkillsPage`、`ConnectionsPage`、`ControlPage` 等。

---

## 六、根目录不合规文件审计

对仓库根目录进行审查，发现多项**不应提交至 Git 仓库**或**不应留存在工程根目录**的文件与制品。

### 1. 根目录文件合规性排查清单

| 文件名 / 路径 | 文件性质与大小 | Git 追踪状态 | 合规判定与整改建议 |
|:---|:---|:---|:---|
| `Nexus_1.2.0_x64-setup.exe` | 编译生成的 Windows NSIS 安装包 (57.89 MB) | **已追踪 (Tracked)** ❌ | **严重违规**。二进制大文件导致 Git 仓库体积膨胀，应使用 `git rm --cached` 移出版本控制，并在 `.gitignore` 中加入 `*.exe`。安装包应通过 GitHub Releases 或构建制品库分发。 |
| `config.json` | 包含本地 host/port/dbPath 的实际配置文件 (405 B) | **已追踪 (Tracked)** ❌ | **违规**。根目录已有模板 `config.example.json`。生产/本地运行生成的 `config.json` 应加入 `.gitignore`（目前仅忽略了 `config.local.json`）。 |
| `PHASE1_REPORT.md` ~ `PHASE9_REPORT.md`<br>`PHASE11_REPORT.md`, `PHASE12_REPORT.md` (共 11 个文件) | 阶段性开发演进报告 (合计约 140 KB) | **已追踪 (Tracked)** ⚠️ | **不规范**。大量的开发过程报告堆积在工程根目录，污染代码树顶层。应整体归档至 `docs/archive/phases/` 目录下。另外 `PHASE10_REPORT.md` 在序列中缺失。 |
| `sbom.json` | CycloneDX 软件物料清单 (129.9 KB) | **已追踪 (Tracked)** ⚠️ | **不规范**。作为构建衍生文件，若非合规强制锁定，通常应由 CI 产出并作为 Release 制品上传，而非长期提交于源码根目录。 |
| `SHA256SUMS.txt` | 发行校验哈希文件 (196 B) | **已追踪 (Tracked)** ⚠️ | **不规范**。属于发布构建制品，应随安装包一并归档于 Release 资产中。 |
| `localbridge.db`<br>`localbridge.db-shm`<br>`localbridge.db-wal` | 运行时生成的 SQLite 数据库及日志文件 | 未追踪 (Untracked / Ignored) ⚠️ | **不规范**。虽然 `.gitignore` 包含 `localbridge.db*`，但在根目录直接启动开发环境导致数据文件散落于代码根路径，存在误提风险。应配置输出至独立 `data/` 目录。 |
| `localbridge.db.pre-migration-v3-*.bak`<br>`localbridge.db.pre-migration-v5-*.bak` | 数据库升级迁移前备份快照 (各约 70~80 KB) | 未追踪 (Untracked / Ignored) ⚠️ | **不规范**。迁移快照堆积在根目录，应统一生成在专用的备份目录（如 `backups/`）。 |
| `desktop-startup.log`<br>`desktop-stderr.log`<br>`desktop-stdout.log` | 桌面端运行日志 (最大 66.7 KB) | 未追踪 (Untracked / Ignored) ⚠️ | **不规范**。桌面启动日志散落在代码根目录。虽然 `*.log` 已被 `.gitignore` 忽略，但日志输出路径应指向操作系统标准日志目录或 `logs/` 文件夹。 |
| `website/` | 官网静态展示站点目录 | 未追踪 (Untracked) ⚠️ | **待明确**。作为产品配套官网，若需长期维护应纳入仓库版本管理或独立为子仓；当前处于 Untracked 悬空状态。 |

---

## 七、第三方依赖与开源许可审计

### 1. 内置二进制运行时与组件许可证审查

在 `apps/desktop/src-tauri/resources/`（即打包到安装包内部的资源）中，实际包含了多套独立运行的第三方二进制与子系统：

| 内置组件名称 | 磁盘位置 | 真实版本 | 官方许可证 | THIRD_PARTY_NOTICES.md 状态 | 合规判定与风险提示 |
|:---|:---|:---|:---|:---|:---|
| **Node.js Runtime** | `resources/runtime/node.exe` | v24.21.0 | MIT License | **已声明** (第 7–39 行)，哈希 `BA4E6D...` 校验完全一致 | ✅ 合规 |
| **Cloudflared 隧道** | `resources/tunnel/cloudflared.exe` 及 `tunnel-client-runtime-cloudflared.exe` | 2026.8.2 | **Apache License 2.0** | **未声明** ❌（全文未见 cloudflared 字样） | ⚠️ **需补充声明**。Cloudflared 遵循 Apache 2.0，虽然本地附带了 `tunnel/LICENSE`，但分发声明文件中未列出该组件及其归属。 |
| **TypeScript 语言服务** | `resources/lsp/node_modules/typescript-language-server/` | ^6.0.0 | **Apache-2.0 / MIT** | **未声明** ❌ | ⚠️ **需补充声明**。用于本地 LSP 服务的核心组件未列入声明。 |
| **TypeScript 核心库** | `resources/lsp/node_modules/typescript/` | ^5.7.3 | **Apache License 2.0** | **未声明** ❌ | ⚠️ **需补充声明**。属于独立分发的代码分析引擎。 |
| **better-sqlite3** | `apps/server/` 原生绑定库 | 13.0.3 | MIT License | **已声明** (第 43–66 行) | ✅ 合规 |
| **Tauri Framework** | 桌面端 Rust 框架与插件 | Tauri 2.x | Apache 2.0 / MIT | **已声明** (第 69–88 行) | ✅ 合规 |
| **bindings / file-uri-to-path**| 工具包 | 1.5.0 / 1.0.0 | MIT License | **已声明** (第 92–96 行) | ✅ 合规 |

### 2. npm / Rust 依赖协议合规性排查

- **npm 依赖合规性**:
  - 全仓共使用 42 个第三方直接依赖包（`fastify`, `zod`, `pino`, `ws`, `yaml`, `@fastify/cors`, `lucide-react`, `tailwindcss` 等）。
  - 经逐一扫描 `package.json` 中的开源协议，依赖均为 **MIT**、**Apache-2.0**、**BSD-2-Clause** 或 **ISC** 宽容型协议。
  - **全仓未引入 GPL、AGPL、LGPL 等强传染性 Copyleft 许可证依赖**，不存在私有代码被迫开源或污染风险。
- **Rust (Cargo) 依赖合规性**:
  - `tauri` (MIT / Apache-2.0)、`tauri-plugin-dialog` (MIT / Apache-2.0)、`tauri-plugin-single-instance` (MIT / Apache-2.0)、`serde` (MIT / Apache-2.0)、`getrandom` (MIT / Apache-2.0)。
  - 全部为极度宽容的 Rust 基础组件，协议完全兼容。

### 3. 开源许可审计结论与整改建议

1. **补全 `THIRD_PARTY_NOTICES.md`**:
   - 增加对 **Cloudflare `cloudflared`**（Apache 2.0）的声明，注明版权方 Cloudflare, Inc. 及许可证全文链接；
   - 增加对 **`typescript-language-server`** 和 **`typescript`** 的分发声明。
2. **版权声明统一**:
   - `LICENSE` 文件中写的是 `Copyright (c) 2026 LocalBridge Contributors`；
   - `tauri.conf.json` 与 `Cargo.toml` 中写的是 `Copyright © 2026 Nexus`；
   - 建议在下一版本中将所有法律实体的版权文案统一为 `Nexus / LocalBridge Contributors`。

---

## 八、审计总结与后续改进建议

本审计报告基于全仓代码、测试用例与配置进行了完整梳理，主要发现汇总如下：

1. **功能演进大幅领先于文档**:
   - 实际工具数量已达到 **64 个**，并具备完整的 Git 写入能力、LSP 代码分析、工作树隔离和本地决策建议，但文档仍停留在 23 个只读工具的陈旧描述阶段。
   - 作业超时在代码中被严格限制为 5 分钟上限，与文档中的“最大 1 小时”存在严重矛盾。
2. **版本号与发布体系存在脱节**:
   - Desktop 为 1.2.0，Core/Runner 为 1.1.0，Bridge 为 1.0.0，CHANGELOG 止步于 1.0.1。
3. **版本库整洁度需优化**:
   - 57MB 的 `.exe` 安装包以及过程性报告文件留存在 Git 索引中，需在后续维护中进行清洗和归档。
4. **开源声明需完善**:
   - 针对随安装包内嵌分发的 `cloudflared.exe` 和 TypeScript LSP 模块，需在第三方声明文件中补齐 Apache 2.0 声明。

---
*(报告完毕。本报告由文档与代码一致性自动化审计引擎严格基于源码生成。)*
