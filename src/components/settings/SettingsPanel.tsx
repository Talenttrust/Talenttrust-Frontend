'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePreferences, type FormDensity, type UserPreferences } from '@/lib/preferences';
import { useToast } from '@/components/toast/toast-provider';
import { reportError } from '@/lib/errorReporter';
import { ErrorSummary } from '@/components/ErrorSummary';
import { validatePreferences } from '@/lib/validatePreferences';
import { MIN_IDLE_DISCONNECT_MS, MAX_IDLE_DISCONNECT_MS } from '@/lib/validatePreferences';

const FOCUSABLE_SELECTORS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  labelId,
  ariaLabel,
  containerClassName,
  textClassName,
  error,
  errorId,
}: {
  options: readonly T[];
  value: T;
  onChange: (val: T) => void;
  labelId: string;
  ariaLabel: string;
  containerClassName: string;
  textClassName: string;
  error?: string;
  errorId?: string;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const radios = Array.from(e.currentTarget.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
      const currentIndex = options.indexOf(value);
      const nextIndex =
        e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? (currentIndex + 1) % options.length
          : (currentIndex - 1 + options.length) % options.length;

      onChange(options[nextIndex]);
      radios[nextIndex]?.focus();
    }
  };

  return (
    <div>
      <div
        className={containerClassName}
        role="radiogroup"
        aria-labelledby={labelId}
        aria-label={ariaLabel}
        aria-describedby={error && errorId ? errorId : undefined}
        aria-invalid={error ? 'true' : undefined}
        onKeyDown={handleKeyDown}
      >
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(option);
              }
            }}
            role="radio"
            aria-checked={value === option}
            tabIndex={value === option ? 0 : -1}
            className={`px-3 py-2 text-sm rounded-md border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${textClassName} ${
              value === option
                ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--muted-foreground)]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {error && errorId && (
        <p id={errorId} className="mt-1 text-sm text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export class ThemeErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    reportError(error, 'ThemeErrorBoundary');
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="p-4 border border-[var(--destructive)] rounded-md bg-[var(--destructive)]/10 text-sm space-y-3 my-4">
          <p className="text-[var(--destructive)] font-medium">Theme section failed to load.</p>
          <button 
            onClick={this.reset}
            className="px-3 py-1.5 bg-[var(--surface)] border border-[var(--destructive)] text-[var(--destructive)] rounded-md hover:opacity-80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--destructive)] focus-visible:ring-offset-2 font-medium"
            aria-label="Retry loading theme section"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { preferences, updatePreference } = usePreferences();
  const { showError } = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const [idleInput, setIdleInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setIdleInput(String(preferences.idleDisconnectMs));
      setErrors({});
    }
  }, [isOpen, preferences.idleDisconnectMs]);

  const clearError = (fieldId: string) => {
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const runValidation = useCallback(() => {
    const result = validatePreferences({
      theme: preferences.theme,
      amountFormat: preferences.amountFormat,
      toastDensity: preferences.toastDensity,
      formDensity: preferences.formDensity,
      milestonesDensity: preferences.milestonesDensity,
      walletDensity: preferences.walletDensity,
      contractsDensity: preferences.contractsDensity,
      quietMode: preferences.quietMode,
      toastDuration: preferences.toastDuration,
      idleDisconnectMs: idleInput,
    });

    const errorMap: Record<string, string> = {};
    for (const err of result) {
      errorMap[err.fieldId] = err.message;
    }

    setErrors(errorMap);
    return result.length === 0;
  }, [preferences, idleInput]);

  const handleUpdate = async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    try {
      await updatePreference(key, value);
    } catch {
      showError({ title: 'Failed to update settings. Please try again.' });
    }
  };

  const handleRadioChange = (key: keyof UserPreferences, value: string) => {
    clearError(`pref-${key}`);
    handleUpdate(key as any, value as any);
  };

  const handleIdleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setIdleInput(val);
    if (errors['pref-idleDisconnectMs']) {
      const testErrors = validatePreferences({
        theme: preferences.theme,
        amountFormat: preferences.amountFormat,
        toastDensity: preferences.toastDensity,
        formDensity: preferences.formDensity,
        milestonesDensity: preferences.milestonesDensity,
        walletDensity: preferences.walletDensity,
        contractsDensity: preferences.contractsDensity,
        quietMode: preferences.quietMode,
        toastDuration: preferences.toastDuration,
        idleDisconnectMs: val,
      });
      const idleErr = testErrors.find((e) => e.fieldId === 'pref-idleDisconnectMs');
      if (idleErr) {
        setErrors((prev) => ({ ...prev, 'pref-idleDisconnectMs': idleErr.message }));
      } else {
        setErrors((prev) => {
          const next = { ...prev };
          delete next['pref-idleDisconnectMs'];
          return next;
        });
      }
    }
  };

  const handleIdleBlur = () => {
    if (idleInput === String(preferences.idleDisconnectMs)) return;
    const testErrors = validatePreferences({
      theme: preferences.theme,
      amountFormat: preferences.amountFormat,
      toastDensity: preferences.toastDensity,
      formDensity: preferences.formDensity,
      milestonesDensity: preferences.milestonesDensity,
      walletDensity: preferences.walletDensity,
      contractsDensity: preferences.contractsDensity,
      quietMode: preferences.quietMode,
      toastDuration: preferences.toastDuration,
      idleDisconnectMs: idleInput,
    });
    const idleErr = testErrors.find((e) => e.fieldId === 'pref-idleDisconnectMs');
    if (idleErr) {
      setErrors((prev) => ({ ...prev, 'pref-idleDisconnectMs': idleErr.message }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next['pref-idleDisconnectMs'];
        return next;
      });
      const parsed = parseInt(idleInput, 10);
      if (!isNaN(parsed) && idleInput.trim() !== '') {
        handleUpdate('idleDisconnectMs', parsed);
      }
    }
  };

  const errorList = Object.entries(errors).map(([fieldId, message]) => ({ fieldId, message }));

  /**
   * Focus management effect for modal dialog accessibility.
   * - Sets initial focus to the close button when dialog opens
   * - Implements focus trapping to prevent focus from leaving the dialog
   * - Handles Tab key wrapping from last to first element
   * - Handles Shift+Tab wrapping from first to last element
   * - Closes dialog on Escape key press
   */
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Save whatever held focus before the panel opened so it can be
    // restored on close (WCAG 2.1 SC 3.2.2), mirroring the restoreFocus
    // behaviour of useDialogFocusTrap without depending on the hook itself.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Set initial focus to the close button
    const closeBtn = panel.querySelector<HTMLElement>('[aria-label="Close settings"]');
    closeBtn?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const els = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  const handleDone = () => {
    if (runValidation()) {
      onClose();
    } else {
      // Focus the error summary so screen readers announce the errors
      requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        tabIndex={-1}
        className="relative w-full max-w-md bg-[var(--background)] shadow-xl flex flex-col h-full border-l border-[var(--border)]"
      >
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <h2 id="settings-panel-title" className="text-xl font-bold text-[var(--foreground)]">Settings</h2>
          <button 
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--accent)] text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            aria-label="Close settings"
          >
            <svg aria-hidden="true" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {errorList.length > 0 && (
            <div ref={errorSummaryRef} tabIndex={-1}>
              <ErrorSummary errors={errorList} />
            </div>
          )}

          {/* Appearance Section */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Appearance</h3>
            
            <div className="space-y-4">
              <ThemeErrorBoundary>
                <div>
                  <label id="theme-label" className="block text-sm font-medium mb-2 text-[var(--foreground)]">Theme</label>
                  <RadioGroup
                    options={['light', 'dark', 'system'] as const}
                    value={preferences.theme}
                    onChange={(val) => handleRadioChange('theme', val)}
                    labelId="theme-label"
                    ariaLabel="Theme"
                    containerClassName="grid grid-cols-3 gap-2"
                    textClassName="capitalize"
                    error={errors['pref-theme']}
                    errorId="pref-theme-error"
                  />
                </div>
              </ThemeErrorBoundary>

              <div>
                <label id="currency-label" className="block text-sm font-medium mb-2 text-[var(--foreground)]">Currency Display</label>
                <RadioGroup
                  options={['usd', 'ngn', 'compact'] as const}
                  value={preferences.amountFormat}
                  onChange={(val) => handleRadioChange('amountFormat', val)}
                  labelId="currency-label"
                  ariaLabel="Currency Display"
                  containerClassName="grid grid-cols-3 gap-2"
                  textClassName="uppercase"
                  error={errors['pref-amountFormat']}
                  errorId="pref-amountFormat-error"
                />
              </div>
            </div>
          </section>

          {/* Notifications Section */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Notifications</h3>
            
            <div className="space-y-4">
              <div>
                <label id="density-label" className="block text-sm font-medium mb-2 text-[var(--foreground)]">Toast Density</label>
                <RadioGroup
                  options={['relaxed', 'compact'] as const}
                  value={preferences.toastDensity}
                  onChange={(val) => handleRadioChange('toastDensity', val)}
                  labelId="density-label"
                  ariaLabel="Toast Density"
                  containerClassName="grid grid-cols-2 gap-2"
                  textClassName="capitalize"
                  error={errors['pref-toastDensity']}
                  errorId="pref-toastDensity-error"
                />
              </div>

              <div>
                <label id="form-density-label" className="block text-sm font-medium mb-2 text-[var(--foreground)]">Form Density</label>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-labelledby="form-density-label"
                  aria-label="Form Density"
                  aria-describedby={errors['pref-formDensity'] ? 'pref-formDensity-error' : undefined}
                  aria-invalid={errors['pref-formDensity'] ? 'true' : undefined}
                >
                  {(['comfortable', 'compact'] as FormDensity[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => handleRadioChange('formDensity', d)}
                      role="radio"
                      aria-checked={preferences.formDensity === d}
                      className={`px-3 py-2 text-sm rounded-md border capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${
                        preferences.formDensity === d
                          ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--muted-foreground)]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                {errors['pref-formDensity'] && (
                  <p id="pref-formDensity-error" className="mt-1 text-sm text-red-600 font-medium" role="alert">
                    {errors['pref-formDensity']}
                  </p>
                )}
              </div>

              <div>
                <label id="contracts-density-label" className="block text-sm font-medium mb-2 text-[var(--foreground)]">Contracts Density</label>
                <RadioGroup
                  options={['comfortable', 'compact'] as const}
                  value={preferences.contractsDensity}
                  onChange={(val) => handleRadioChange('contractsDensity', val)}
                  labelId="contracts-density-label"
                  ariaLabel="Contracts Density"
                  containerClassName="grid grid-cols-2 gap-2"
                  textClassName="capitalize"
                  error={errors['pref-contractsDensity']}
                  errorId="pref-contractsDensity-error"
                />
              </div>

              <div>
                <label id="quiet-mode-label" className="block text-sm font-medium mb-2 text-[var(--foreground)]">Quiet Mode</label>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--muted-foreground)]">Suppress success notifications</p>
                  <button
                    onClick={() => {
                      clearError('pref-quietMode');
                      handleUpdate('quietMode', !preferences.quietMode);
                    }}
                    role="switch"
                    aria-checked={preferences.quietMode}
                    aria-labelledby="quiet-mode-label"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${
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

              <div>
                <label htmlFor="pref-idleDisconnectMs" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                  Idle Disconnect Timeout
                </label>
                <p className="text-xs text-[var(--muted-foreground)] mb-2">
                  Auto-disconnect after inactivity. Set to 0 to disable, or {MIN_IDLE_DISCONNECT_MS}–{MAX_IDLE_DISCONNECT_MS} ms.
                </p>
                <input
                  id="pref-idleDisconnectMs"
                  type="text"
                  inputMode="numeric"
                  value={idleInput}
                  onChange={handleIdleChange}
                  onBlur={handleIdleBlur}
                  aria-invalid={!!errors['pref-idleDisconnectMs']}
                  aria-describedby={errors['pref-idleDisconnectMs'] ? 'pref-idleDisconnectMs-error' : undefined}
                  className={`w-full px-3 py-2 text-sm rounded-md border bg-[var(--surface)] text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${
                    errors['pref-idleDisconnectMs']
                      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                      : 'border-[var(--border)]'
                  }`}
                />
                {errors['pref-idleDisconnectMs'] && (
                  <p id="pref-idleDisconnectMs-error" className="mt-1 text-sm text-red-600 font-medium" role="alert">
                    {errors['pref-idleDisconnectMs']}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="p-6 border-t border-[var(--border)] bg-[var(--surface)]">
          <button 
            onClick={handleDone}
            className="w-full py-2 px-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
