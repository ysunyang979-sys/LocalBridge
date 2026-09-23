# Nexus MCP Bridge

> Standard MCP HTTP / Streamable HTTP Bridge for connecting Gemini Spark Custom Apps to Nexus LocalBridge on Windows.

---

## 架构

```text
Gemini Spark (Custom App)
      │
      │ HTTPS (Streamable HTTP / MCP Protocol 2024-11-05)
      ▼
Cloudflare Tunnel (https://<tunnel-domain>/mcp)
      │
      ▼
Nexus MCP Bridge (http://127.0.0.1:8787/mcp)
      │
      │ Authorization: Bearer <NEXUS_BRIDGE_TOKEN>
      │ Whitelisted 8 Tools | Path Sandbox Security
      ▼
Nexus LocalBridge (http://127.0.0.1:18080)
      │
      ├── Projects (Myweb, etc.)
      ├── Files (Read, Create, Write, Directory List)
      ├── Git (Status)
      └── Runtime (List)
```

---

## 白名单工具列表 (Phase 1)

| 工具名称 | 功能描述 | 核心参数 |
|---|---|---|
| `nexus_project_list` | 列出所有受控本地项目（包含项目 ID、名称及路径） | 无 |
| `nexus_project_info` | 获取指定项目的详细配置信息 | `projectId` (支持项目名或 ID) |
| `nexus_directory_list` | 列出项目指定目录下的子文件与子目录清单 | `projectId`, `path` |
| `nexus_file_read` | 读取项目内指定文本文件的完整内容或切片 | `projectId`, `path`, `offset`, `limit` |
| `nexus_file_create` | 在受管项目目录内安全创建新文件 | `projectId`, `path`, `content` |
| `nexus_file_write` | 重写或更新项目目录内现有文件的内容 | `projectId`, `path`, `content` |
| `nexus_git_status` | 查询受管项目的当前 Git 工作区状态 | `projectId` |
| `nexus_runtime_list` | 查询项目中当前激活或已注册的本地持久化运行时服务 | `projectId` |

---

## 安全防护体系

1. **零 Shell 暴露**：严禁暴露 `command_run`、`shell`、PowerShell 或 CMD。
2. **零凭证管理**：严禁外部客户端创建、删除或查询 Nexus 系统令牌。
3. **路径沙箱机制**：所有文件操作必须严格限制在已登记的受控项目目录内，任何包含 `..` 或试图穿越项目根目录的操作将被直接拦截。
4. **Bearer Token 鉴权**：所有 `/mcp` 请求必须携带 `Authorization: Bearer <NEXUS_BRIDGE_TOKEN>`。
5. **日志脱敏**：绝不在控制台日志中打印令牌、密钥或文件敏感正文。

---

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npm run build

# 3. 启动服务 (默认监听 127.0.0.1:8787)
npm start
```

或双击运行：
- `start-bridge.bat`：启动 Bridge
- `stop-bridge.bat`：停止 Bridge
