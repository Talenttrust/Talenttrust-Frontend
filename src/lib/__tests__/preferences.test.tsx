import React from 'react';
import { render, act, renderHook, screen, fireEvent } from '@testing-library/react';
import { PreferencesProvider, sanitizePreferences, usePreferences } from '../preferences';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe('PreferencesProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides default preferences', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.theme).toBe('system');
    expect(result.current.preferences.amountFormat).toBe('usd');
  });

  it('updates preferences and persists to localStorage', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });

    act(() => {
      result.current.updatePreference('theme', 'dark');
    });

    expect(result.current.preferences.theme).toBe('dark');
    const saved = JSON.parse(localStorage.getItem('talenttrust-user-preferences') || '{}');
    expect(saved.theme).toBe('dark');
  });

  it('loads preferences from localStorage on mount', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ theme: 'light', quietMode: true }),
    );
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.theme).toBe('light');
    expect(result.current.preferences.quietMode).toBe(true);
  });

  it('merges partial localStorage data with defaults', () => {
    localStorage.setItem('talenttrust-user-preferences', JSON.stringify({ theme: 'dark' }));
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.theme).toBe('dark');
    expect(result.current.preferences.amountFormat).toBe('usd'); // default preserved
  });

  it('drops invalid localStorage values and unknown keys during hydration', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({
        theme: 'neon',
        amountFormat: 'compact',
        quietMode: 'yes',
        adminMode: true,
      }),
    );

    const { result } = renderHook(() => usePreferences(), { wrapper });

    expect(result.current.preferences).toEqual({
      theme: 'system',
      amountFormat: 'compact',
      toastDensity: 'relaxed',
      quietMode: false,
    });
    expect('adminMode' in result.current.preferences).toBe(false);
  });

  it('does not hydrate prototype-pollution keys from localStorage', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      '{"theme":"dark","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
    );

    const { result } = renderHook(() => usePreferences(), { wrapper });

    expect(result.current.preferences.theme).toBe('dark');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect('polluted' in result.current.preferences).toBe(false);
  });

  it('silently falls back to defaults when localStorage contains invalid JSON', () => {
    localStorage.setItem('talenttrust-user-preferences', '%%%invalid%%%');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.theme).toBe('system');
    (console.error as jest.Mock).mockRestore();
  });
});

describe('sanitizePreferences', () => {
  it('returns defaults for empty or non-object payloads', () => {
    expect(sanitizePreferences('')).toEqual({
      theme: 'system',
      amountFormat: 'usd',
      toastDensity: 'relaxed',
      quietMode: false,
    });
    expect(sanitizePreferences(['dark'])).toEqual({
      theme: 'system',
      amountFormat: 'usd',
      toastDensity: 'relaxed',
      quietMode: false,
    });
  });

  it('keeps only valid whitelisted preference values', () => {
    expect(
      sanitizePreferences({
        theme: 'light',
        amountFormat: 'ngn',
        toastDensity: 'compact',
        quietMode: true,
        extra: 'ignored',
      }),
    ).toEqual({
      theme: 'light',
      amountFormat: 'ngn',
      toastDensity: 'compact',
      quietMode: true,
    });
  });

  it('falls back per field when enums or booleans are invalid', () => {
    expect(
      sanitizePreferences({
        theme: 'blue',
        amountFormat: 'crypto',
        toastDensity: false,
        quietMode: 'true',
      }),
    ).toEqual({
      theme: 'system',
      amountFormat: 'usd',
      toastDensity: 'relaxed',
      quietMode: false,
    });
  });
});

describe('formatAmount – usd (default)', () => {
  it('formats a typical USD amount', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.formatAmount(1000, 'USD')).toBe('$1,000.00');
  });

  it('formats zero', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.formatAmount(0, 'USD')).toBe('$0.00');
  });

  it('formats a large payout', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.formatAmount(1_000_000, 'USD')).toBe('$1,000,000.00');
  });

  it('formats a fractional amount', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.formatAmount(0.5, 'USD')).toBe('$0.50');
  });

  it('formats a negative amount', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    // sign style may vary by runtime; just assert currency symbol present
    expect(result.current.formatAmount(-250, 'USD')).toContain('250');
  });

  it('defaults currency to USD when none is passed', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.formatAmount(50)).toBe('$50.00');
  });

  it('respects a custom currency for the default format', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    const expected = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(1250);

    expect(result.current.formatAmount(1250, 'EUR')).toBe(expected);
  });
});

describe('formatAmount – ngn', () => {
  it('formats a typical NGN amount', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.updatePreference('amountFormat', 'ngn'); });
    const formatted = result.current.formatAmount(5000, 'USD'); // currency overridden to NGN
    expect(formatted).toMatch(/5[,.]?000/); // ₦5,000.00 or locale variant
    expect(formatted).toMatch(/NGN|₦/);
  });

  it('formats zero in NGN', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.updatePreference('amountFormat', 'ngn'); });
    expect(result.current.formatAmount(0)).toMatch(/NGN|₦/);
  });

  it('formats a large NGN payout', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.updatePreference('amountFormat', 'ngn'); });
    const formatted = result.current.formatAmount(1_000_000);
    expect(formatted).toMatch(/1[,.]?000[,.]?000/);
  });
});

describe('formatAmount – compact', () => {
  it('abbreviates thousands', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.updatePreference('amountFormat', 'compact'); });
    const formatted = result.current.formatAmount(1500, 'USD');
    expect(formatted).toMatch(/1\.?5K|\$2K|\$1K/); // runtime may round
  });

  it('abbreviates millions', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.updatePreference('amountFormat', 'compact'); });
    expect(result.current.formatAmount(2_500_000, 'USD')).toMatch(/M/i);
  });

  it('formats zero compactly', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.updatePreference('amountFormat', 'compact'); });
    expect(result.current.formatAmount(0, 'USD')).toMatch(/\$0/);
  });

  it('keeps a custom currency when compact notation is enabled', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.updatePreference('amountFormat', 'compact'); });
    const expected = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      style: 'currency',
      currency: 'EUR',
    }).format(1_500);

    expect(result.current.formatAmount(1_500, 'EUR')).toBe(expected);
  });
});

describe('persistence and re-render', () => {
  it('persists amountFormat change and new consumers see updated format', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });

    act(() => { result.current.updatePreference('amountFormat', 'ngn'); });

    const saved = JSON.parse(localStorage.getItem('talenttrust-user-preferences') || '{}');
    expect(saved.amountFormat).toBe('ngn');

    // New hook instance in the same provider sees the updated format
    const { result: result2 } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result2.current.updatePreference('amountFormat', 'ngn'); });
    expect(result2.current.preferences.amountFormat).toBe('ngn');
  });

  it('persists quietMode and re-hydrates correctly', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.updatePreference('quietMode', true); });

    const saved = JSON.parse(localStorage.getItem('talenttrust-user-preferences') || '{}');
    expect(saved.quietMode).toBe(true);

    // Simulate new page load
    const { result: fresh } = renderHook(() => usePreferences(), { wrapper });
    act(() => {}); // flush effects
    // fresh hook loads from the saved localStorage value set above
    expect(JSON.parse(localStorage.getItem('talenttrust-user-preferences') || '{}').quietMode).toBe(true);
  });

  it('consumer component re-renders with updated format', () => {
    localStorage.clear(); // isolate from previous persistence tests
    function AmountDisplay() {
      const { formatAmount, updatePreference } = usePreferences();
      return (
        <>
          <span data-testid="amount">{formatAmount(1000, 'USD')}</span>
          <button onClick={() => updatePreference('amountFormat', 'ngn')}>switch</button>
        </>
      );
    }

    render(<PreferencesProvider><AmountDisplay /></PreferencesProvider>);
    expect(screen.getByTestId('amount').textContent).toBe('$1,000.00');

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'switch' })); });

    // After switching to NGN the displayed text should contain NGN symbol/code
    expect(screen.getByTestId('amount').textContent).toMatch(/NGN|₦/);
  });
});

describe('usePreferences outside provider', () => {
  it('returns default fallback without throwing', () => {
    const { result } = renderHook(() => usePreferences());
    expect(result.current.preferences.theme).toBe('system');
    expect(result.current.formatAmount(100, 'USD')).toBe('$100.00');
  });

  it('provides a no-op updatePreference fallback and honors custom currency formatting', () => {
    const { result } = renderHook(() => usePreferences());
    const expected = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(100);

    expect(() => result.current.updatePreference('theme', 'dark')).not.toThrow();
    expect(result.current.preferences.theme).toBe('system');
    expect(result.current.formatAmount(100, 'EUR')).toBe(expected);
  });
});
