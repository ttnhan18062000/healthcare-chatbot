"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { type Language, type Translations, translations } from "@/lib/i18n";

type LanguageContextValue = {
  language: Language;
  t: Translations;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "vi",
  t: translations.vi,
  toggleLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("vi");

  useEffect(() => {
    const stored = localStorage.getItem("language") as Language | null;
    if (stored && stored in translations) {
      setLanguage(stored);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next: Language = prev === "vi" ? "en" : "vi";
      localStorage.setItem("language", next);
      return next;
    });
  }, []);

  return (
    <LanguageContext.Provider
      value={{ language, t: translations[language], toggleLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
