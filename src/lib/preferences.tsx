'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type AmountFormat = 'xlm' | 'usd' | 'compact';
export type ToastDensity = 'comfortable' | 'compact';

export interface UserPreferences {
  theme: Theme;
  amountFormat: AmountFormat;
  toastDensity: ToastDensity;
  quietMode: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  amountFormat: 'xlm',
  toastDensity: 'comfortable',
  quietMode: false,
};

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  formatAmount: (amount: number, currency?: string) => string;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

const STORAGE_KEY = 'talenttrust-user-preferences';

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) });
      } catch (e) {
        console.error('Failed to parse preferences', e);
      }
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage when preferences change
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
  }, [preferences, isHydrated]);

  // Apply theme to document
  useEffect(() => {
    const applyTheme = (theme: Theme) => {
      const root = document.documentElement;
      let effectiveTheme = theme;

      if (theme === 'system') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      root.setAttribute('data-theme', effectiveTheme);
      root.classList.remove('light', 'dark');
      root.classList.add(effectiveTheme);
    };

    applyTheme(preferences.theme);

    // Listener for system theme changes
    if (preferences.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme('system');
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [preferences.theme]);

  const updatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const formatAmount = (amount: number, currency: string = 'USD') => {
    const { amountFormat } = preferences;
    
    if (amountFormat === 'xlm') {
      // Mock conversion for demo: 1 USD = 7 XLM approx
      const xlmAmount = amount * 7.14;
      return `${xlmAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} XLM`;
    }

    if (amountFormat === 'compact') {
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        style: 'currency',
        currency,
      }).format(amount);
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreference, formatAmount }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    // Return default preferences if used outside a provider (useful for testing)
    return {
      preferences: DEFAULT_PREFERENCES,
      updatePreference: () => {},
      formatAmount: (amount: number, currency: string = 'USD') => 
        new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount),
    };
  }
  return context;
}
