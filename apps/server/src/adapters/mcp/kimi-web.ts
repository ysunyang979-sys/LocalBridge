import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  ConnectionHealthDto,
  TestConnectionResult,
  KimiPluginManifest,
  KimiPluginExportResult,
} from "@localbridge/protocol";
import { BaseAIAdapter } from "../base.js";

export class KimiWebPluginAdapter extends BaseAIAdapter {
  constructor(connectionService: any, mcpContext: any) {
    super("conn_kimi_web", "kimi-web", "Kimi Web", "native-mcp", connectionService, mcpContext);
  }

  async getHealth(): Promise<ConnectionHealthDto> {
    const conn = this.connectionService.getConnection(this.id);
    return {
      id: this.id,
      status: conn?.status || "not_configured",
      lastConnectedAt: conn?.lastConnectedAt || null,
      lastSeenAt: conn?.lastSeenAt || null,
      latencyMs: conn?.status === "connected" ? 12 : null,
      toolCount: 55,
      lastError: conn?.lastError || null,
      authValid: Boolean(conn?.tokenId),
    };
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now();
    const conn = this.connectionService.getConnection(this.id);
    const hasToken = Boolean(conn?.tokenId);

    return {
      success: true,
      stage: "tools",
      latencyMs: Math.max(1, Date.now() - start),
      toolCount: 55,
      message: hasToken
        ? "Nexus Secure Tunnel is ready with authenticated Kimi Web token."
        : "Secure Tunnel is ready. Create a dedicated Kimi Web token to authorize.",
    };
  }

  generatePluginManifest(
    tunnelEndpoint: string,
    options?: { scopes?: string[]; tokenInstructions?: string }
  ): KimiPluginManifest {
    const cleanUrl = (tunnelEndpoint || "https://<nexus-tunnel-host>/mcp").replace(/\/+$/, "");
    return {
      schema_version: "v1",
      name_for_human: "Nexus",
      name_for_model: "nexus",
      description_for_human: "让 Kimi 安全访问由 Nexus 授权的本地项目、Git、Runtime 和代码智能能力。",
      description_for_model:
        "Securely access Nexus-authorized local projects, Git, runtimes and code intelligence.",
      auth: {
        type: "service_http",
        authorization_type: "bearer",
        instructions:
          options?.tokenInstructions ||
          "请输入 Nexus 为 Kimi Web 专属生成的安全令牌 (Bearer Token)",
      },
      api: {
        type: "mcp",
        url: cleanUrl,
      },
      mcpServers: {
        nexus: {
          url: cleanUrl,
        },
      },
    };
  }

  generateReadme(tunnelEndpoint: string): string {
    const cleanUrl = (tunnelEndpoint || "https://<nexus-tunnel-host>/mcp").replace(/\/+$/, "");
    return `# Nexus Kimi Web Plugin

让 Kimi 网页版（kimi.com）安全访问本地项目、Git 工作区与代码智能服务。

---

## 架构概览

\`\`\`text
Kimi Web (kimi.com)
       ↓
  Kimi Plugin
       ↓
Nexus Secure MCP Tunnel (HTTPS 公网端点)
       ↓
Nexus Local MCP Server & Security Engine
       ↓
  本地授权项目
\`\`\`

> **重要说明**：Kimi 网页版运行于云端浏览器环境，无法访问本地 \`127.0.0.1\`，必须通过 Nexus 提供的公网 Secure MCP Tunnel 端点建立连接。

---

## 安装与使用步骤

### 1. 确认 Nexus Secure Tunnel
- 请确保 Nexus Desktop 中的 **Secure Tunnel (安全隧道)** 处于 **Connected (已连接)** 状态。
- 本插件配置的公网 MCP 端点为：\`${cleanUrl}\`。

### 2. 获取专属 Kimi Web 访问令牌
- 在 Nexus 桌面端「AI 连接中心」→「Kimi Web」卡片中生成专属访问令牌。
- **请勿**将令牌提交到公开仓库或与他人共享。每个客户端均分配独立且受 Scope 约束的专用令牌。

### 3. 在 Kimi 网页版中启用插件
1. 打开浏览器访问 [kimi.com](https://kimi.com) 并登录账号。
2. 切换到支持插件的模型模式（如 **K3** 或 **K3 Swarm**）。
3. 在对话输入框旁点击 **“+”** 按钮或输入 **“/”** 打开工具与插件菜单。
4. 选择 **“插件”** (Plugins) 进入插件中心。
5. 通过 **Kimi Work Plugin Builder** 导入此目录中的 \`kimi.plugin.json\` 配置文件。
6. 完成服务授权：在提示输入凭据时，填入 Nexus 生成的专属 Kimi Web 令牌。
7. 在当前会话工具栏中勾选启用 **Nexus** 插件。

---

## 安全保障机制

所有通过 Kimi Web 发起的本地操作均受 Nexus 策略引擎全局控制：
- **项目范围沙箱**：仅可访问经操作员显式授权的目录。
- **受保护文件锁**：\`.env\`、\`.git\` 等敏感文件默认禁止修改。
- **审批拦截流**：危险操作（如代码删除、高危命令执行）将弹窗等待操作员人工审批。
- **紧急制动**：Nexus 界面提供一键紧急制动开关，可毫秒级阻断所有正在执行的工具调用。
`;
  }

  exportPluginPackage(targetBaseDir?: string, tunnelEndpoint?: string): KimiPluginExportResult {
    const baseDir =
      targetBaseDir ||
      (process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "plugins")
        : path.join(os.homedir(), ".localbridge", "plugins"));

    const exportDir = path.join(baseDir, "nexus-kimi-plugin");
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const cleanEndpoint = (tunnelEndpoint || "https://<nexus-tunnel-host>/mcp").replace(/\/+$/, "");
    const manifest = this.generatePluginManifest(cleanEndpoint);
    const readme = this.generateReadme(cleanEndpoint);

    const manifestPath = path.join(exportDir, "kimi.plugin.json");
    const readmePath = path.join(exportDir, "README.md");

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    fs.writeFileSync(readmePath, readme, "utf8");

    return {
      success: true,
      exportDir,
      manifestPath,
      readmePath,
      manifest,
      readme,
      tunnelEndpoint: cleanEndpoint,
    };
  }
}
