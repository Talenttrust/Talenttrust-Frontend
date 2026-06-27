'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getItem, setItem } from './safeStorage';


export type Theme = 'light' | 'dark' | 'system';
export type AmountFormat = 'usd' | 'ngn' | 'compact';
export type ToastDensity = 'relaxed' | 'compact';

interface SafeCurrencyFormatOptions extends Intl.NumberFormatOptions {
  locale?: string;
}

/**
 * Safely format a number as currency, falling back to USD if the provided currency code is invalid.
 */
function safeCurrencyFormat(
  amount: number,
  currency: string,
  options: SafeCurrencyFormatOptions = {}
): string {
  const { locale, ...formatOptions } = options;
  const defaultCurrency = 'USD';
  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      ...formatOptions,
      style: 'currency',
      currency,
    }).format(amount);
  } catch (_e) {
    return new Intl.NumberFormat(locale || 'en-US', {
      ...formatOptions,
      style: 'currency',
      currency: defaultCurrency,
    }).format(amount);
  }
}

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

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = getItem(STORAGE_KEY);
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
      setItem(STORAGE_KEY, JSON.stringify(preferences));
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
      return safeCurrencyFormat(amount, activeCurrency, {
        locale: 'en-US',
        notation: 'compact',
      });
    }

    return safeCurrencyFormat(amount, activeCurrency, {
      locale,
    });
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
        safeCurrencyFormat(amount, currency, { locale: 'en-US' }),
    };
  }
  return context;
}
