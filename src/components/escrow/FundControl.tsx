'use client';

import { useId, useState } from 'react';
import {
  Contract,
  formatIssueMax,
  nextMilestoneDeposit,
  remainingBalance,
  validateDeposit,
} from './fundControl';

export type FundControlProps = {
  contract: Contract;
  /** Posts the deposit. Resolves on success, rejects on failure. */
  onDeposit: (amount: number) => Promise<void>;
  /** Called after a successful deposit so the parent can refresh. */
  onSuccess?: () => void;
};

function formatAmount(value: number): string {
  return value.toFixed(7).replace(/\.?0+$/, '');
}

function extractApiError(err: unknown): string {
  if (err instanceof Error && err.message) {
    const msg = err.message;
    if (msg.includes('over_funded')) {
      return 'Deposit exceeds the remaining balance.';
    }
    if (msg.includes('invalid_status')) {
      return 'This escrow cannot accept deposits in its current status.';
    }
    return msg;
  }
  return 'Deposit failed. Please try again.';
}

export default function FundControl({ contract, onDeposit, onSuccess }: FundControlProps) {
  const inputId = useId();
  const errorId = useId();
  const labelId = useId();
  const barId = useId();

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const remaining = remainingBalance(contract);
  const nextMilestone = nextMilestoneDeposit(contract);
  const funded = contract.fundedAmount;
  const total = contract.totalAmount;
  const percent = total > 0 ? Math.min(Math.round((funded / total) * 100), 100) : 0;

  const invalid = error !== null;

  async function submit(amount: number) {
    setSubmitting(true);
    setError(null);
    try {
      await onDeposit(amount);
      setValue('');
      onSuccess?.();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validateDeposit(value, contract);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    void submit(result.amount);
  }

  function applyPreset(amount: number) {
    setError(null);
    setValue(formatAmount(amount));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setValue('');
      setError(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
          <span>Funded</span>
          <span>
            {formatAmount(funded)} / {formatAmount(total)}
          </span>
        </div>
        <div
          id={barId}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Funding progress"
          className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        >
          <div
            className="h-full rounded-full bg-blue-600 dark:bg-blue-400"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
        <label id={labelId} htmlFor={inputId} className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Deposit amount
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            aria-labelledby={labelId}
            aria-invalid={invalid ? 'true' : undefined}
            aria-describedby={invalid ? errorId : undefined}
            placeholder={`Up to ${formatIssueMax(remaining)}`}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-400"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 dark:bg-blue-500 dark:focus:ring-blue-400"
          >
            {submitting ? 'Depositing…' : 'Deposit'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={nextMilestone <= 0}
            onClick={() => applyPreset(nextMilestone)}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-100 dark:focus:ring-blue-400"
          >
            Next milestone ({formatAmount(nextMilestone)})
          </button>
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => applyPreset(remaining)}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-gray-600 dark:text-gray-100 dark:focus:ring-blue-400"
            >
              Remaining ({formatAmount(remaining)})
            </button>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
