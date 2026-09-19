import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import {
  DICTIONARIES,
  detectInitialLanguage,
  persistLanguage,
  getTranslatedError,
  type SupportedLanguage,
  type I18nDictionary,
} from "./index.js";

export type { SupportedLanguage, I18nDictionary };

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: I18nDictionary;
  translateError: (code: string | undefined | null, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(detectInitialLanguage);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    persistLanguage(lang);
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => {
    const t = DICTIONARIES[language] || DICTIONARIES["en-US"];
    return {
      language,
      setLanguage,
      t,
      translateError: (code, fallback) => getTranslatedError(code, language, fallback),
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}
