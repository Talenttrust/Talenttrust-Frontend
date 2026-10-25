'use client';

import { useCallback, useRef, KeyboardEvent } from 'react';
import type { ViewFilter } from '@/lib/api';

interface Option {
  value: ViewFilter;
  label: string;
}

const OPTIONS: Option[] = [
  { value: 'all', label: 'All' },
  { value: 'client', label: 'As client' },
  { value: 'freelancer', label: 'As freelancer' },
];

interface ViewFilterControlProps {
  value: ViewFilter;
  onChange: (v: ViewFilter) => void;
  /** When true the wallet-dependent options are disabled with a hint. */
  walletConnected: boolean;
}

/**
 * Segmented radiogroup: All / As client / As freelancer.
 *
 * Implements the ARIA radiogroup pattern:
 *   – The group receives focus; arrow keys move between options.
 *   – Only the selected radio is in the tab sequence (roving tabIndex).
 *   – When the wallet is not connected the group is still focusable but
 *     "As client" / "As freelancer" are aria-disabled with a tooltip hint.
 */
export function ViewFilterControl({ value, onChange, walletConnected }: ViewFilterControlProps) {
  const groupRef = useRef<HTMLDivElement>(null);

  const focusOption = useCallback((index: number) => {
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[index]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const buttons = Array.from(
        groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
      );
      const currentIndex = buttons.findIndex((b) => b === document.activeElement);
      if (currentIndex === -1) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (currentIndex + 1) % buttons.length;
        focusOption(next);
        const nextOption = OPTIONS[next];
        if (!nextOption) return;
        if (nextOption.value !== 'all' && !walletConnected) return;
        onChange(nextOption.value);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (currentIndex - 1 + buttons.length) % buttons.length;
        focusOption(prev);
        const prevOption = OPTIONS[prev];
        if (!prevOption) return;
        if (prevOption.value !== 'all' && !walletConnected) return;
        onChange(prevOption.value);
      }
    },
    [focusOption, onChange, walletConnected],
  );

  const hint = 'Connect a wallet to filter by role';

  return (
    <div
      role="radiogroup"
      aria-label="View filter"
      className="view-filter"
      ref={groupRef}
      onKeyDown={handleKeyDown}
    >
      {OPTIONS.map((opt) => {
        const isSelected = value === opt.value;
        const isDisabled = opt.value !== 'all' && !walletConnected;

        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isDisabled || undefined}
            // Roving tabIndex: only the selected button is in the tab sequence.
            tabIndex={isSelected ? 0 : -1}
            title={isDisabled ? hint : undefined}
            className={`view-filter__btn${isSelected ? ' view-filter__btn--active' : ''}${isDisabled ? ' view-filter__btn--disabled' : ''}`}
            onClick={() => {
              if (!isDisabled) onChange(opt.value);
            }}
            // Accessible name already comes from the text content; aria-label
            // adds the disabled hint for screen readers.
            aria-label={isDisabled ? `${opt.label} (${hint})` : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
