import React from "react";
import { FolderGit2, Sparkles, CheckCircle2, Cpu, ArrowRight, X, ShieldCheck } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";
import nexusLogo from "../../assets/nexus.png";

export interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorizeProject?: () => void;
  onDownloadLaya?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onAuthorizeProject,
  onDownloadLaya,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const handleFinish = () => {
    localStorage.setItem("nexus_onboarding_completed", "true");
    onClose();
  };

  const handleAuthorizeAndFinish = () => {
    handleFinish();
    if (onAuthorizeProject) {
      onAuthorizeProject();
    }
  };

  const handleDownloadLayaAndFinish = () => {
    handleFinish();
    if (onDownloadLaya) {
      onDownloadLaya();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-theme-card border border-theme-subtle rounded-2xl shadow-2xl p-6 sm:p-7 space-y-6">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleFinish}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-muted transition"
          aria-label={t.common.close}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-theme-card-muted border border-theme-subtle flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
            <img
              src={nexusLogo}
              alt="Nexus"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/nexus.png";
              }}
            />
          </div>
          <div>
            <h2 className="text-base font-semibold text-theme-primary tracking-tight">
              {t.onboarding.welcomeTitle}
            </h2>
            <p className="text-xs text-theme-secondary mt-0.5">
              {t.onboarding.welcomeSubtitle}
            </p>
          </div>
        </div>

        {/* Step Cards */}
        <div className="space-y-2.5">
          {/* Step 1 */}
          <div className="p-3.5 rounded-xl bg-theme-card-muted border border-theme-subtle flex items-start gap-3 transition hover:border-theme-muted">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 text-xs flex-1">
              <div className="font-semibold text-theme-primary">
                {t.onboarding.step1Title}
              </div>
              <div className="text-theme-muted leading-relaxed">
                {t.onboarding.step1Desc}
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-3.5 rounded-xl bg-theme-card-muted border border-theme-subtle flex items-start gap-3 transition hover:border-theme-muted">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 text-xs flex-1">
              <div className="font-semibold text-theme-primary">
                {t.onboarding.step2Title}
              </div>
              <div className="text-theme-muted leading-relaxed">
                {t.onboarding.step2Desc}
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-3.5 rounded-xl bg-theme-card-muted border border-theme-subtle flex items-start gap-3 transition hover:border-theme-muted">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 text-xs flex-1">
              <div className="font-semibold text-theme-primary">
                {t.onboarding.step3Title}
              </div>
              <div className="text-theme-muted leading-relaxed">
                {t.onboarding.step3Desc}
              </div>
            </div>
          </div>

          {/* Step 4 Optional */}
          <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="space-y-1 text-xs flex-1">
              <div className="font-medium text-purple-400">
                {t.onboarding.step4OptionalTitle}
              </div>
              <div className="text-theme-muted leading-relaxed">
                {t.onboarding.step4OptionalDesc}
              </div>
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={handleDownloadLayaAndFinish}
                  className="text-[11px] font-medium text-purple-400 hover:text-purple-300 underline underline-offset-2 transition"
                >
                  {t.onboarding.downloadLayaBtn} &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* License Agreement Notice */}
        <div className="p-3 rounded-xl bg-theme-card-muted/70 border border-theme-subtle flex items-start gap-2.5 text-[11px] text-theme-muted">
          <ShieldCheck className="w-4 h-4 text-theme-secondary shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            {t.onboarding.licenseAgreementText}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleFinish}
            className="px-4 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-card-muted transition"
          >
            {t.onboarding.skipForNowBtn}
          </button>
          <button
            type="button"
            onClick={handleAuthorizeAndFinish}
            className="px-5 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition flex items-center gap-1.5"
          >
            <span>{t.onboarding.getStartedBtn}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
