import { describe, it, expect, vi } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import {
  AppErrorBoundary,
  ConnectionCenterErrorBoundary,
  sanitizeErrorDetails,
} from "../apps/desktop/src/components/common/AppErrorBoundary.js";

describe("chatgpt-connection-error-boundary.test - Error Boundary Remount & Texts", () => {
  it("renders children cleanly when no error occurs", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(
        ConnectionCenterErrorBoundary,
        { isZh: true },
        React.createElement("div", { id: "child-node" }, "Connection Content")
      )
    );
    expect(html).toContain("Connection Content");
  });

  it("scrubs sensitive tokens from stack traces and errors", () => {
    const sensitive = "Error at lb_sec_123456789 with Bearer lb_secret_token_abcdef and sk-123456789";
    const scrubbed = sanitizeErrorDetails(sensitive);
    expect(scrubbed).not.toContain("lb_sec_123456789");
    expect(scrubbed).not.toContain("sk-123456789");
    expect(scrubbed).toContain("••••••••");
  });

  it("increments remountKey upon reset to guarantee a fresh remount rather than re-rendering corrupted fiber", () => {
    const onResetMock = vi.fn();
    const boundary = new AppErrorBoundary({
      children: React.createElement("div", null, "Child"),
      onReset: onResetMock,
    });

    let nextState: any = null;
    boundary.setState = ((updater: any) => {
      nextState = typeof updater === "function" ? updater(boundary.state) : updater;
    }) as any;

    expect((boundary.state as any).remountKey).toBe(0);

    boundary.handleReset();

    expect(nextState.remountKey).toBe(1);
    expect(nextState.hasError).toBe(false);
    expect(onResetMock).toHaveBeenCalledTimes(1);
  });

  it("ErrorBoundary provides '返回 ChatGPT 连接' and 'Something went wrong in ChatGPT Connection'", () => {
    const boundary = new AppErrorBoundary({
      children: null,
      isZh: true,
    });
    // Simulate error state
    boundary.state = {
      hasError: true,
      error: new Error("Simulated render crash"),
      errorInfo: null,
      crashId: "CONNECTION_UI_CRASH_TEST_123",
      copied: false,
      remountKey: 0,
    };

    const element = boundary.render() as React.ReactElement;
    expect(element).toBeDefined();
    const renderedStr = ReactDOMServer.renderToString(element);
    expect(renderedStr).toContain("返回 ChatGPT 连接");
    expect(renderedStr).not.toContain("返回 AI 连接中心");
    expect(renderedStr).toContain("重试");
    expect(renderedStr).toContain("CONNECTION_UI_CRASH_TEST_123");
  });
});
