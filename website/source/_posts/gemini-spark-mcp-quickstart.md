---
title: 实战教程：5 分钟配置 Gemini Spark 安全读写本地代码仓库并执行测试
date: 2026-09-22 14:00:00
tags: [Tutorial, GeminiSpark, Quickstart]
description: 手把手教学：从启动 Nexus 桌面端、授权项目目录到在 Gemini Spark 中建立标准 MCP 连接全过程演示。
---

Google 推出的 **Gemini Spark** 系列模型以其惊人的长上下文与极快的前期首字延迟著称。通过 Nexus，你可以让 Gemini Spark 成为你的本地结对编程专家。

本篇教程将指导你如何在 5 分钟内完成全套配置。

---

## 准备工作

1. 已安装 **Nexus 客户端**（若尚未安装，可前往 [下载中心](/about/) 获取安装包）。
2. 一个待操作的本地工程目录（例如 `D:\workspace\my-web-app`）。
3. 拥有 Google Gemini Spark 使用权限。

---

## 步骤 1：授权本地工程项目

启动 Nexus 桌面客户端：

1. 点击左侧导航栏的 **Projects（项目管理）**。
2. 点击右上角 **+ Authorize New Project**。
3. 选择你的项目文件夹，并在权限选项中选择 **Read-Write（读写模式）**。
4. 确认后，Nexus 将为该项目分配一个受保护的项目 ID（如 `my-web-app`），并创建安全快照索引。

---

## 步骤 2：启动安全穿透隧道

为了让 Google 云端的 Gemini Spark 访问你本地运行的 Nexus 桥接服务：

1. 在 Nexus 桌面端进入 **Connections（连接管理）** 页面。
2. 点击 **Start Cloudflare Tunnel**。
3. Nexus 会自动启动集成的穿透守护进程，并在数秒内生成一个临时的安全端点：
   ```text
   https://random-assigned-name.trycloudflare.com
   ```
4. 复制该端点地址。

---

## 步骤 3：在 Gemini Spark 中建立 MCP 连接

1. 打开 Gemini Spark 设置面板，找到 **Tools & Extensions (MCP)**。
2. 添加一个新的 MCP Server：
   * **Server Name**: `Nexus Local`
   * **URL**: `https://random-assigned-name.trycloudflare.com/mcp`
3. 保存后，Gemini 后端将自动对 Nexus 发起探测：
   * Nexus 返回 RFC 8414 与 RFC 9728 保护资源元数据。
   * 自动完成 OAuth 2.0 PKCE 握手。
   * Gemini 成功同步到 8 个受控标准工具（`nexus_file_read`、`nexus_file_write`、`nexus_git_status` 等）。

---

## 步骤 4：体验结对编程

现在，在对话框中直接给 Gemini Spark 下达指令：

> "请帮我检查当前项目 `src/routes/api.ts` 中的用户注册接口，找出潜在的空指针异常，并给出修复后的完整补丁。"

Gemini Spark 将自动调用 `nexus_file_read` 获取源码，并在提出修改建议时调用 `nexus_file_write`。在本地 Nexus 桌面端，你将看到一个清晰的代码对比弹窗，点击 **Approve** 即可一键更新本地代码！
