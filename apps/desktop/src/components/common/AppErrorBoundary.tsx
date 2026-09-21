import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft, Copy, Check } from "lucide-react";

export interface SanitizedErrorInfo {
  crashId: string;
  component: string;
  action?: string;
  connectionType?: string;
  connectionId?: string;
  errorName: string;
  errorMessage: string;
  stackHash?: string;
  timestamp: string;
}

/**
 * Strips potential secrets, tokens, and api keys from error messages and stacks.
 */
export function sanitizeErrorDetails(text: string): string {
  if (!text) return "";
  return text
    .replace(/lb_[a-zA-Z0-9_-]{8,}/g, "lb_••••••••")
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, "sk-••••••••")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer ••••••••")
    .replace(/(?:api[_-]?key|secret|password|token)[=:]\s*["']?[^"'&\s]+["']?/gi, "$1=••••••••");
}

function generateCrashId(prefix = "CONNECTION_UI_CRASH"): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  const time = Date.now().toString(36).toUpperCase();
  return `${prefix}_${time}_${rand}`;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitleZh?: string;
  fallbackTitleEn?: string;
  componentName?: string;
  onReset?: () => void;
  isZh?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  crashId: string | null;
  copied: boolean;
}

export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      crashId: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const crashId = generateCrashId();
    return {
      hasError: true,
      error,
      crashId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const crashId = this.state.crashId || generateCrashId();
    const sanitizedMsg = sanitizeErrorDetails(error?.message || "Unknown error");
    const sanitizedStack = sanitizeErrorDetails(errorInfo?.componentStack || error?.stack || "");

    const payload: SanitizedErrorInfo = {
      crashId,
      component: this.props.componentName || "AppErrorBoundary",
      errorName: error?.name || "Error",
      errorMessage: sanitizedMsg,
      stackHash: sanitizedStack.slice(0, 300),
      timestamp: new Date().toISOString(),
    };

    console.error("[Nexus UI Crash Guard]", payload);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, crashId: null, copied: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleCopyDetails = () => {
    const { error, crashId, errorInfo } = this.state;
    const sanitizedMsg = sanitizeErrorDetails(error?.message || "Unknown error");
    const sanitizedStack = sanitizeErrorDetails(errorInfo?.componentStack || error?.stack || "");

    const report = JSON.stringify(
      {
        crashId,
        component: this.props.componentName || "Component",
        errorName: error?.name,
        errorMessage: sanitizedMsg,
        stack: sanitizedStack,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    );

    navigator.clipboard.writeText(report);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    if (this.state.hasError) {
      const isZh = this.props.isZh ?? true;
      const title = isZh
        ? (this.props.fallbackTitleZh || "连接页面发生错误")
        : (this.props.fallbackTitleEn || "Something went wrong in AI Connections");

      const subtitle = isZh ? "Nexus 仍在运行。" : "Nexus is still running.";
      const retryText = isZh ? "重试" : "Retry";
      const backText = isZh ? "返回 AI 连接中心" : "Back to AI Connections";
      const copyText = isZh ? "复制错误详情" : "Copy error details";
      const copiedText = isZh ? "已复制" : "Copied";

      return (
        <div className="p-8 rounded-2xl bg-theme-card border border-red-500/30 text-theme-primary space-y-5 shadow-lg my-4 max-w-2xl mx-auto animate-fade-in">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-theme-primary">{title}</h2>
              <p className="text-xs text-theme-muted font-medium">{subtitle}</p>
              {this.state.crashId && (
                <div className="text-[11px] font-mono text-theme-muted pt-1">
                  Crash ID: <span className="font-semibold text-theme-secondary">{this.state.crashId}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-theme-card-muted border border-theme-subtle font-mono text-xs text-red-600 dark:text-red-400 break-words max-h-40 overflow-y-auto">
            {sanitizeErrorDetails(this.state.error?.message || "An unexpected error occurred during rendering.")}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-theme-subtle flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{retryText}</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{backText}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={this.handleCopyDetails}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-theme-card-muted hover:bg-theme-card-hover text-theme-muted hover:text-theme-secondary border border-theme-subtle transition flex items-center gap-1.5"
            >
              {this.state.copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{this.state.copied ? copiedText : copyText}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const ConnectionCenterErrorBoundary: React.FC<{
  children: ReactNode;
  onReset?: () => void;
  isZh?: boolean;
}> = (props) => {
  return (
    <AppErrorBoundary
      componentName="AIConnectionCenter"
      fallbackTitleZh="连接页面发生错误"
      fallbackTitleEn="Something went wrong in AI Connections"
      {...props}
    />
  );
};
