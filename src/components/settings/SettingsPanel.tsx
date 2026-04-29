'use client';

import React from 'react';
import { usePreferences, Theme, AmountFormat, ToastDensity } from '@/lib/preferences';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { preferences, updatePreference } = usePreferences();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 transition-opacity backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-[var(--background)] shadow-xl flex flex-col h-full border-l border-[var(--border)]">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Settings</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
            aria-label="Close settings"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Appearance Section */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Appearance</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--foreground)]">Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => updatePreference('theme', t)}
                      className={`px-3 py-2 text-sm rounded-md border capitalize transition-all ${
                        preferences.theme === t 
                          ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]' 
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--muted-foreground)]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--foreground)]">Amount Display</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['xlm', 'usd', 'compact'] as AmountFormat[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => updatePreference('amountFormat', f)}
                      className={`px-3 py-2 text-sm rounded-md border uppercase transition-all ${
                        preferences.amountFormat === f 
                          ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]' 
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--muted-foreground)]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Notifications Section */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Notifications</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--foreground)]">Toast Density</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['comfortable', 'compact'] as ToastDensity[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => updatePreference('toastDensity', d)}
                      className={`px-3 py-2 text-sm rounded-md border capitalize transition-all ${
                        preferences.toastDensity === d 
                          ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]' 
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--muted-foreground)]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-[var(--foreground)]">Quiet Mode</label>
                  <p className="text-xs text-[var(--muted-foreground)]">Suppress success notifications</p>
                </div>
                <button
                  onClick={() => updatePreference('quietMode', !preferences.quietMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    preferences.quietMode ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      preferences.quietMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="p-6 border-t border-[var(--border)] bg-[var(--surface)]">
          <button 
            onClick={onClose}
            className="w-full py-2 px-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
