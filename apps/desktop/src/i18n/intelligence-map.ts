export function mapRiskLabel(risk: string | undefined, locale: string): string {
  const r = (risk || "").toLowerCase();
  const isZh = locale.startsWith("zh");
  switch (r) {
    case "critical":
      return isZh ? "极高风险" : "Critical";
    case "high":
      return isZh ? "高风险" : "High";
    case "medium":
      return isZh ? "中风险" : "Medium";
    case "low":
      return isZh ? "低风险" : "Low";
    default:
      return risk || (isZh ? "未评估" : "Unassessed");
  }
}

export function mapApprovalRecommendation(
  recommended: boolean | string | undefined,
  locale: string
): string {
  const isZh = locale.startsWith("zh");
  if (recommended === true || recommended === "APPROVE" || recommended === "approve") {
    return isZh ? "建议批准" : "Approve";
  }
  if (recommended === false || recommended === "DENY" || recommended === "deny") {
    return isZh ? "建议拒绝" : "Deny";
  }
  if (
    recommended === "ASK" ||
    recommended === "REVIEW" ||
    recommended === "ask" ||
    recommended === "review"
  ) {
    return isZh ? "需人工审核" : "Review Required";
  }
  return isZh ? "需人工审核" : "Review Required";
}

export function mapCategory(cat: string | null | undefined, locale: string): string {
  const c = (cat || "").toLowerCase();
  const isZh = locale.startsWith("zh");
  switch (c) {
    case "read":
      return isZh ? "读取" : "Read";
    case "write":
      return isZh ? "写入" : "Write";
    case "execute":
      return isZh ? "执行" : "Execute";
    case "git":
      return isZh ? "Git 操作" : "Git";
    case "runtime":
      return isZh ? "运行时" : "Runtime";
    case "worktree":
      return isZh ? "工作区隔离" : "Worktree";
    case "security":
      return isZh ? "安全策略" : "Security";
    case "system":
      return isZh ? "系统操作" : "System";
    case "general":
    default:
      return isZh ? "通用" : "General";
  }
}

export function mapReasoningTag(tag: string, locale: string): string {
  const isZh = locale.startsWith("zh");
  if (!tag) return "";

  if (tag === "intelligence_disabled") {
    return isZh ? "智能决策未启用" : "Decision intelligence is disabled";
  }
  if (tag.startsWith("fallback:")) {
    const reason = tag.replace("fallback:", "");
    switch (reason) {
      case "worker_unavailable":
        return isZh ? "Worker 服务不可用 (后备策略)" : "Worker unavailable (fallback)";
      case "timeout":
        return isZh ? "推理超时 (后备策略)" : "Inference timeout (fallback)";
      case "worker_crash":
        return isZh ? "Worker 异常退出 (后备策略)" : "Worker crashed (fallback)";
      case "send_failed":
        return isZh ? "通信失败 (后备策略)" : "Communication failed (fallback)";
      case "model_not_loaded":
        return isZh ? "模型未加载 (后备策略)" : "Model not loaded (fallback)";
      default:
        return isZh ? `使用后备策略 (${reason})` : `Fallback used (${reason})`;
    }
  }
  if (tag === "protected_resource") {
    return isZh ? "涉及受保护资源" : "Protected resource";
  }
  if (tag === "has_command") {
    return isZh ? "包含系统命令" : "Contains command";
  }
  if (tag.startsWith("domain:")) {
    const d = tag.replace("domain:", "");
    return (isZh ? "操作领域: " : "Domain: ") + mapCategory(d, locale);
  }
  if (tag.startsWith("risk:")) {
    const r = tag.replace("risk:", "");
    return (isZh ? "风险级别: " : "Risk: ") + mapRiskLabel(r, locale);
  }
  if (tag.startsWith("op:")) {
    return (isZh ? "操作: " : "Op: ") + tag.replace("op:", "");
  }
  return tag;
}

export function formatLatency(
  latencyMs: number | undefined | null,
  isRealInference: boolean
): string {
  if (!isRealInference || latencyMs === undefined || latencyMs === null || latencyMs <= 0) {
    return "—";
  }
  return `${latencyMs} ms`;
}
