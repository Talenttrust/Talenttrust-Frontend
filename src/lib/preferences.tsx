'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type AmountFormat = 'usd' | 'ngn' | 'compact';
export type ToastDensity = 'relaxed' | 'compact';

export interface UserPreferences {
  theme: Theme;
  amountFormat: AmountFormat;
  toastDensity: ToastDensity;
  quietMode: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  amountFormat: 'usd',
  toastDensity: 'relaxed',
  quietMode: false,
};

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  formatAmount: (amount: number, currency?: string) => string;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

const STORAGE_KEY = 'talenttrust-user-preferences';
const THEME_VALUES = ['light', 'dark', 'system'] as const;
const AMOUNT_FORMAT_VALUES = ['usd', 'ngn', 'compact'] as const;
const TOAST_DENSITY_VALUES = ['relaxed', 'compact'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && allowed.includes(value as T);

/**
 * Return a safe preference object from untrusted persisted data.
 * Only known keys with valid values are copied, so malformed storage and
 * prototype-pollution keys cannot reach application state.
 */
export function sanitizePreferences(raw: unknown): UserPreferences {
  if (!isRecord(raw)) {
    return { ...DEFAULT_PREFERENCES };
  }

  const sanitized = { ...DEFAULT_PREFERENCES };

  if (isOneOf(raw.theme, THEME_VALUES)) {
    sanitized.theme = raw.theme;
  }

  if (isOneOf(raw.amountFormat, AMOUNT_FORMAT_VALUES)) {
    sanitized.amountFormat = raw.amountFormat;
  }

  if (isOneOf(raw.toastDensity, TOAST_DENSITY_VALUES)) {
    sanitized.toastDensity = raw.toastDensity;
  }

  if (typeof raw.quietMode === 'boolean') {
    sanitized.quietMode = raw.quietMode;
  }

  return sanitized;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setPreferences(sanitizePreferences(JSON.parse(saved)));
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

  /**
   * Format monetary values using the active amount preference.
   * USD keeps the caller-provided currency, NGN forces Nigerian Naira,
   * and compact keeps the caller-provided currency with compact notation.
   */
  const formatAmount = (amount: number, currency: string = 'USD') => {
    const { amountFormat } = preferences;
    
    // Determine which currency to use based on settings
    const activeCurrency = amountFormat === 'ngn' ? 'NGN' : currency;
    const locale = amountFormat === 'ngn' ? 'en-NG' : 'en-US';

    if (amountFormat === 'compact') {
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        style: 'currency',
        currency: activeCurrency,
      }).format(amount);
    }

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: activeCurrency,
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
