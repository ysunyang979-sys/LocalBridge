import { describe, it, expect } from "vitest";
import {
  mapRiskLabel,
  mapApprovalRecommendation,
  mapCategory,
  mapReasoningTag,
} from "../apps/desktop/src/i18n/intelligence-map.js";

describe("Laya i18n Status & Telemetry Mapping Suite", () => {
  it("maps risk labels accurately in zh-CN and en-US", () => {
    expect(mapRiskLabel("critical", "zh-CN")).toBe("极高风险");
    expect(mapRiskLabel("critical", "en-US")).toBe("Critical");

    expect(mapRiskLabel("high", "zh-CN")).toBe("高风险");
    expect(mapRiskLabel("high", "en-US")).toBe("High");

    expect(mapRiskLabel("medium", "zh-CN")).toBe("中风险");
    expect(mapRiskLabel("medium", "en-US")).toBe("Medium");

    expect(mapRiskLabel("low", "zh-CN")).toBe("低风险");
    expect(mapRiskLabel("low", "en-US")).toBe("Low");

    expect(mapRiskLabel(undefined, "zh-CN")).toBe("未评估");
    expect(mapRiskLabel(undefined, "en-US")).toBe("Unassessed");
  });

  it("maps approval recommendations accurately in zh-CN and en-US", () => {
    expect(mapApprovalRecommendation(true, "zh-CN")).toBe("建议批准");
    expect(mapApprovalRecommendation(true, "en-US")).toBe("Approve");

    expect(mapApprovalRecommendation("APPROVE", "zh-CN")).toBe("建议批准");
    expect(mapApprovalRecommendation("approve", "en-US")).toBe("Approve");

    expect(mapApprovalRecommendation(false, "zh-CN")).toBe("建议拒绝");
    expect(mapApprovalRecommendation(false, "en-US")).toBe("Deny");

    expect(mapApprovalRecommendation("DENY", "zh-CN")).toBe("建议拒绝");
    expect(mapApprovalRecommendation("deny", "en-US")).toBe("Deny");

    expect(mapApprovalRecommendation("REVIEW", "zh-CN")).toBe("需人工审核");
    expect(mapApprovalRecommendation("review", "en-US")).toBe("Review Required");
  });

  it("maps operation categories accurately in zh-CN and en-US", () => {
    expect(mapCategory("read", "zh-CN")).toBe("读取");
    expect(mapCategory("read", "en-US")).toBe("Read");

    expect(mapCategory("write", "zh-CN")).toBe("写入");
    expect(mapCategory("write", "en-US")).toBe("Write");

    expect(mapCategory("execute", "zh-CN")).toBe("执行");
    expect(mapCategory("execute", "en-US")).toBe("Execute");

    expect(mapCategory("git", "zh-CN")).toBe("Git 操作");
    expect(mapCategory("git", "en-US")).toBe("Git");

    expect(mapCategory("system", "zh-CN")).toBe("系统操作");
    expect(mapCategory("system", "en-US")).toBe("System");

    expect(mapCategory("general", "zh-CN")).toBe("通用");
    expect(mapCategory("general", "en-US")).toBe("General");
  });

  it("maps reasoning tags and fallback reasons accurately in zh-CN and en-US", () => {
    expect(mapReasoningTag("intelligence_disabled", "zh-CN")).toBe("智能决策未启用");
    expect(mapReasoningTag("intelligence_disabled", "en-US")).toBe(
      "Decision intelligence is disabled"
    );

    expect(mapReasoningTag("fallback:worker_unavailable", "zh-CN")).toBe(
      "Worker 服务不可用 (后备策略)"
    );
    expect(mapReasoningTag("fallback:worker_unavailable", "en-US")).toBe(
      "Worker unavailable (fallback)"
    );

    expect(mapReasoningTag("fallback:timeout", "zh-CN")).toBe("推理超时 (后备策略)");
    expect(mapReasoningTag("fallback:timeout", "en-US")).toBe("Inference timeout (fallback)");

    expect(mapReasoningTag("fallback:worker_crash", "zh-CN")).toBe("Worker 异常退出 (后备策略)");
    expect(mapReasoningTag("fallback:worker_crash", "en-US")).toBe("Worker crashed (fallback)");

    expect(mapReasoningTag("protected_resource", "zh-CN")).toBe("涉及受保护资源");
    expect(mapReasoningTag("protected_resource", "en-US")).toBe("Protected resource");

    expect(mapReasoningTag("domain:execute", "zh-CN")).toBe("操作领域: 执行");
    expect(mapReasoningTag("domain:execute", "en-US")).toBe("Domain: Execute");

    expect(mapReasoningTag("risk:high", "zh-CN")).toBe("风险级别: 高风险");
    expect(mapReasoningTag("risk:high", "en-US")).toBe("Risk: High");
  });
});
