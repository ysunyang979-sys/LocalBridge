---
title: Nexus 技能开发指南：如何构建和分发自定义工程技能包
date: 2026-09-20 16:45:00
tags: [Skills, Plugins, Guide]
description: 详细讲解 Nexus Skills 的目录规范、清单格式 (skill.yaml)、沙箱参数校验与热导入机制。
---

**Nexus 技能系统 (Skills System)** 允许开发者将团队沉淀的工程经验、代码检查规则与自动化流水线封装为可复用的 AI 插件。

通过技能包，大模型不仅能够理解通用的编程语法，还能精准遵从团队特定的架构风格。

---

## 1. 技能包目录结构

一个标准合规的 Nexus 技能目录结构如下：

```text
my-custom-skill/
├── skill.yaml          # 必需：技能清单定义、权限声明与输入 Schema
└── index.js            # 必需：执行逻辑体
```

---

## 2. 编写 `skill.yaml` 清单

`skill.yaml` 是 Nexus 实施权限审计的核心凭证：

```yaml
schemaVersion: "1.0.0"
name: "nexus.team-linter"
version: "1.0.0"
description: "执行团队代码风格规范检查并自动修正轻微格式问题"
author: "Engineering Team"

permissions:
  files:
    read: true
    write: true
  command:
    execute: false     # 显式禁止运行任意 Shell

tools:
  - name: "lint_and_fix"
    description: "扫描指定路径并返回格式化结果"
    parameters:
      type: object
      properties:
        targetPath:
          type: string
          description: "待检查的文件相对路径"
      required: ["targetPath"]
```

---

## 3. 打包与热导入

1. 将技能文件夹压缩为标准的 ZIP 格式（例如 `my-custom-skill.zip`）。
2. 在 Nexus 桌面主控台中进入 **Skills（技能中心）** 页面。
3. 点击 **Import Skill (导入技能)**，选择刚生成的 ZIP 压缩包。
4. Nexus 审核校验模块将在内存沙箱中自动解压并验证清单签名无越权行为后热载入。

---

## 4. 8 大官方预置技能

Nexus 安装包已自带包括 `nexus.code-debug`、`nexus.git-review`、`nexus.fix-build`、`nexus.safe-refactor` 在内的 8 大开箱即用工程技能。
