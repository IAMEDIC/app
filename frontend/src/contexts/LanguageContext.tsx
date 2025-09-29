import React, { createContext, useContext, useState, ReactNode } from 'react';

// Import language files
import enTranslations from '@/locales/en.json';
import esTranslations from '@/locales/es.json';

// Types
export type Language = 'en' | 'es';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  availableLanguages: { code: Language; name: string; nativeName: string }[];
}

// Available languages
const AVAILABLE_LANGUAGES = [
  { code: 'en' as Language, name: 'English', nativeName: 'English' },
  { code: 'es' as Language, name: 'Spanish', nativeName: 'Español' },
];

// Translations object
const translations = {
  en: enTranslations,
  es: esTranslations,
};

// Storage key for persisting language preference
const LANGUAGE_STORAGE_KEY = 'iamedic-language';

// Context
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Helper function to detect browser language
const detectBrowserLanguage = (): Language => {
  // Get browser language
  const browserLang = navigator.language || (navigator as any).userLanguage;
  
  // Extract language code (e.g., 'es-ES' -> 'es')
  const langCode = browserLang.toLowerCase().split('-')[0];
  
  // Check if we support this language
  if (langCode === 'es' || langCode === 'spa') {
    return 'es';
  }
  
  // Default to English
  return 'en';
};

// Helper function to get nested object value by string path
const getNestedValue = (obj: any, path: string): string => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};

// Helper function to replace placeholders in translation strings
const replacePlaceholders = (text: string, values: Record<string, string | number> = {}): string => {
  return Object.keys(values).reduce((result, key) => {
    return result.replace(new RegExp(`\\{${key}\\}`, 'g'), values[key].toString());
  }, text);
};

// Provider component
interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  // Initialize language from localStorage or browser detection
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language;
      if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'es')) {
        return savedLanguage;
      }
    } catch (error) {
      console.warn('Failed to read language from localStorage:', error);
    }
    
    // Fallback to browser detection
    return detectBrowserLanguage();
  });

  // Update localStorage when language changes
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (error) {
      console.warn('Failed to save language to localStorage:', error);
    }
  };

  // Translation function
  const t = (key: string, values?: Record<string, string | number>): string => {
    const translation = getNestedValue(translations[language], key);
    
    if (translation !== undefined) {
      return values ? replacePlaceholders(translation, values) : translation;
    }
    
    // Fallback to English if translation not found
    if (language !== 'en') {
      const fallback = getNestedValue(translations.en, key);
      if (fallback !== undefined) {
        console.warn(`Translation missing for key "${key}" in language "${language}", using English fallback`);
        return values ? replacePlaceholders(fallback, values) : fallback;
      }
    }
    
    // If no translation found, return the key itself
    console.warn(`Translation missing for key "${key}"`);
    return key;
  };

  const contextValue: LanguageContextType = {
    language,
    setLanguage,
    t,
    availableLanguages: AVAILABLE_LANGUAGES,
  };

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
};

// Custom hook to use language context
export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

// Export individual functions for convenience
export const useTranslation = () => {
  const { t } = useLanguage();
  return { t };
};