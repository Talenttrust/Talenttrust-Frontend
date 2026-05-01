import React from 'react';
import { render, act, renderHook } from '@testing-library/react';
import { PreferencesProvider, usePreferences } from '../preferences';

describe('PreferencesProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('provides default preferences', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PreferencesProvider>{children}</PreferencesProvider>
    );
    const { result } = renderHook(() => usePreferences(), { wrapper });

    expect(result.current.preferences.theme).toBe('system');
    expect(result.current.preferences.amountFormat).toBe('usd');
  });

  it('updates preferences and persists to localStorage', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PreferencesProvider>{children}</PreferencesProvider>
    );
    const { result } = renderHook(() => usePreferences(), { wrapper });

    act(() => {
      result.current.updatePreference('theme', 'dark');
    });

    expect(result.current.preferences.theme).toBe('dark');
    const saved = JSON.parse(localStorage.getItem('talenttrust-user-preferences') || '{}');
    expect(saved.theme).toBe('dark');
  });

  it('loads preferences from localStorage on mount', () => {
    localStorage.setItem('talenttrust-user-preferences', JSON.stringify({ theme: 'light', quietMode: true }));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PreferencesProvider>{children}</PreferencesProvider>
    );
    const { result } = renderHook(() => usePreferences(), { wrapper });

    // Wait for hydration effect
    act(() => {
      jest.advanceTimersByTime?.(0);
    });

    expect(result.current.preferences.theme).toBe('light');
    expect(result.current.preferences.quietMode).toBe(true);
  });
});
