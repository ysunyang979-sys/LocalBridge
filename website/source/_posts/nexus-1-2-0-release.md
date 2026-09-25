---
title: Nexus 1.2.0 正式发布：为 ChatGPT 与 Gemini Spark 构筑零信任本地执行中枢
date: 2026-09-24 10:00:00
tags: [Release, MCP, Architecture]
description: 详解 Nexus 1.2.0 如何通过原生 MCP 2.0、OAuth 2.0 PKCE 握手协议与本地零信任沙箱，让前沿大模型安全操作本地工程代码。
---

今天，我们非常自豪地宣布 **Nexus 1.2.0** 现已正式发布！

Nexus 从诞生之初，就立志于解决开发者在拥抱自主 AI 软件工程师时面临的最大顾虑——**安全与控制权**。在 1.2.0 版本中，我们带来了对 **Google Gemini Spark** 的深度协议适配，以及对 **OpenAI ChatGPT** 专用网关的全面增强。

---

## 1. 为什么我们需要 Nexus？

随着大语言模型（LLM）从单纯的“聊天对话”演进为能够调用工具、修改工程代码的“自主软件工程师”，开发者面临一个核心困境：

* **生产力爆发**：开发者希望将本地庞大的项目源码、配置文件、Git 仓库与开发工具链开放给顶尖模型，实现自动化跨文件重构、错误诊断与项目分析。
* **安全底线**：让远程 AI 直连本地存在巨大隐患。一旦外部模型遭遇提示词注入（Prompt Injection）或恶意代码投毒，未经受限的本地访问权限将导致敏感密钥泄露（如 `.env`、SSH 私钥）甚至远程代码执行（RCE）。

Nexus 旨在解决这一矛盾：**在保障本地计算机绝对安全、物理权限强可控的前提下，构建一条标准化、企业级、易穿透的双向控制桥梁。**

---

## 2. 1.2.0 核心特性速览

### 2.1 深度对齐 Google Gemini Spark 规范
针对 Google Gemini Spark 的连接规范，Nexus MCP Bridge 实现了严苛的标准对齐：
* **链路探测适配**：针对 Google 后端探针，支持 `HEAD /mcp` 返回 `Link: <.../.well-known/oauth-protected-resource>; rel="oauth-protected-resource"`，避免 405 Method Not Allowed 错误。
* **CORS 暴露标头**：显式暴露 `WWW-Authenticate, Link, Mcp-Session-Id, Mcp-Protocol-Version, Content-Type`，确保浏览器端与 Google 边缘代理平稳通信。
* **动态客户端注册 (DCR)**：支持 Gemini 后端在无预置凭据的情况下自动交换 `client_id`。
* **RFC 7636 PKCE S256**：防篡改授权校验，保障授权重定向安全。

### 2.2 专有 ChatGPT 专用 AI 网关
为 OpenAI ChatGPT 提供了经物理裁剪的专用通道，仅暴露 8 大安全核心工具，阻断任何非法的终端底层执行。

### 2.3 自包含运行时环境
Nexus 1.2.0 Windows 安装包内置了独立验证的 Node.js 24 运行时环境、SQLite 引擎与语言服务器，无需开发者在宿主机上预先配置复杂的开发依赖。

---

## 3. 立即体验

访问 [关于与下载页面](/about/) 即可获取最新的 `Nexus_1.2.0_x64-setup.exe` 独立安装包。
