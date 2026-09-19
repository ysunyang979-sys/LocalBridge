import React, { useState } from "react";
import { ShieldCheck, Check, RotateCcw, Globe, SunMoon, Server, Info } from "lucide-react";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { useTheme, type ThemeMode } from "../theme/ThemeContext.js";

interface SettingsPageProps {
  onRefresh: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onRefresh }) => {
  const { t, language, setLanguage } = useTranslation();
  const { themeMode, setThemeMode } = useTheme();

  const [serverUrl, setServerUrl] = useState(bridge.getBaseUrl());
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    bridge.setBaseUrl(serverUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  const handleReset = () => {
    bridge.setBaseUrl("http://127.0.0.1:18080");
    setServerUrl("http://127.0.0.1:18080");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-theme-primary">{t.settings.title}</h2>
        <p className="text-xs text-theme-muted">{t.settings.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: General & Appearance */}
        <div className="space-y-6">
          {/* General: Language */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Globe className="w-4 h-4 text-indigo-500" />
              <span>{t.settings.generalGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-2">
                {t.settings.languageLabel}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage("zh-CN")}
                  className={`p-3 rounded-lg border text-xs font-medium transition text-left ${
                    language === "zh-CN"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-theme-input border-theme-input text-theme-secondary hover:border-indigo-500"
                  }`}
                >
                  <div className="font-semibold">{t.settings.languageZh}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">zh-CN</div>
                </button>

                <button
                  type="button"
                  onClick={() => setLanguage("en-US")}
                  className={`p-3 rounded-lg border text-xs font-medium transition text-left ${
                    language === "en-US"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-theme-input border-theme-input text-theme-secondary hover:border-indigo-500"
                  }`}
                >
                  <div className="font-semibold">{t.settings.languageEn}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">en-US</div>
                </button>
              </div>
            </div>
          </div>

          {/* Appearance: Theme */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <SunMoon className="w-4 h-4 text-indigo-500" />
              <span>{t.settings.appearanceGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-2">
                {t.settings.themeLabel}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(["system", "light", "dark"] as ThemeMode[]).map((mode) => {
                  const label =
                    mode === "system"
                      ? t.settings.themeSystem
                      : mode === "light"
                        ? t.settings.themeLight
                        : t.settings.themeDark;
                  const active = themeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setThemeMode(mode)}
                      className={`p-3 rounded-lg border text-xs font-medium transition text-center ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                          : "bg-theme-input border-theme-input text-theme-secondary hover:border-indigo-500"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Server Connection */}
          <form onSubmit={handleSave} className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Server className="w-4 h-4 text-indigo-500" />
              <span>{t.settings.serverConnectionGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.settings.serverUrlLabel}
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-theme-muted mt-1">{t.settings.serverUrlHelp}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
              >
                {saved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>{t.common.saved}</span>
                  </>
                ) : (
                  <span>{t.settings.saveChanges}</span>
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 px-3 py-2 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs font-medium border border-theme-subtle transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.settings.resetDefault}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Security Architecture & About */}
        <div className="space-y-6">
          {/* Security Architecture Summary */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 text-xs shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{t.settings.securityTitle}</span>
            </div>

            <ul className="space-y-3 text-theme-secondary list-disc list-inside">
              <li>
                <strong className="text-theme-primary">{t.settings.loopbackGuarantee}:</strong>{" "}
                {t.settings.loopbackGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.sandboxGuarantee}:</strong>{" "}
                {t.settings.sandboxGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.approvalGuarantee}:</strong>{" "}
                {t.settings.approvalGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.killswitchGuarantee}:</strong>{" "}
                {t.settings.killswitchGuaranteeDesc}
              </li>
            </ul>
          </div>

          {/* About Section */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-3 text-xs shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Info className="w-4 h-4 text-indigo-500" />
              <span>{t.settings.aboutGroup}</span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <img
                src="/app-icon.png"
                alt="LocalBridge"
                className="w-10 h-10 rounded-lg object-contain shadow-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/favicon.png";
                }}
              />
              <div>
                <div className="font-bold text-sm text-theme-primary">{t.settings.appName}</div>
                <div className="text-theme-muted">{t.settings.versionLabel} 1.1.0</div>
              </div>
            </div>

            <div className="text-[11px] text-theme-muted border-t border-theme-subtle pt-3">
              {t.settings.architectureLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
