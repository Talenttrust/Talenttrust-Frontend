'use client';

import React, { useState, useCallback } from 'react';
import { FormField } from '@/components/FormField';
import {
  combineValidators,
  validateRequired,
  validateMaxLength,
  validatePositiveNumber,
} from '@/lib/fieldValidators';
import { sanitizeUserText } from '@/lib/sanitizeUserText';

export const MAX_MILESTONE_TITLE_LENGTH = 200;
export const MAX_MILESTONES = 20;

export interface MilestoneInput {
  id: string;
  title: string;
  amount: string;
}

export interface MilestoneBuilderProps {
  /** Current milestones array */
  milestones: MilestoneInput[];
  /** Called when milestones change */
  onChange: (milestones: MilestoneInput[]) => void;
  /** Currency symbol to display (e.g., '$', '€', '£') */
  currencySymbol?: string;
  /** Error message for the entire milestone builder */
  error?: string;
}

/**
 * MilestoneBuilder - A structured interface for entering multiple milestones
 * with title and amount fields, add/remove/reorder support, live total calculation,
 * and per-field validation.
 *
 * Features:
 * - One row per milestone with title and amount inputs
 * - Add milestone button (up to MAX_MILESTONES)
 * - Remove milestone button (minimum 1 milestone)
 * - Reorder milestones via drag handles (up/down arrows)
 * - Live total calculation displayed
 * - Per-field validation with inline errors
 * - 20-milestone cap enforcement
 */
export const MilestoneBuilder: React.FC<MilestoneBuilderProps> = ({
  milestones,
  onChange,
  currencySymbol = '$',
  error,
}) => {
  const validateTitleField = combineValidators([
    validateRequired('Milestone title'),
    validateMaxLength('Milestone title', MAX_MILESTONE_TITLE_LENGTH),
  ]);

  const validateAmountField = combineValidators([
    validateRequired('Milestone amount'),
    validatePositiveNumber('Milestone amount'),
  ]);

  /**
   * Adds a new empty milestone to the list
   */
  const addMilestone = useCallback(() => {
    if (milestones.length >= MAX_MILESTONES) return;
    
    const newMilestone: MilestoneInput = {
      id: crypto.randomUUID(),
      title: '',
      amount: '',
    };
    onChange([...milestones, newMilestone]);
  }, [milestones, onChange]);

  /**
   * Removes a milestone at the specified index
   */
  const removeMilestone = useCallback((index: number) => {
    if (milestones.length <= 1) return;
    
    const updated = milestones.filter((_, i) => i !== index);
    onChange(updated);
  }, [milestones, onChange]);

  /**
   * Moves a milestone up in the list
   */
  const moveMilestoneUp = useCallback((index: number) => {
    if (index === 0) return;
    
    const updated = [...milestones];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated);
  }, [milestones, onChange]);

  /**
   * Moves a milestone down in the list
   */
  const moveMilestoneDown = useCallback((index: number) => {
    if (index === milestones.length - 1) return;
    
    const updated = [...milestones];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated);
  }, [milestones, onChange]);

  /**
   * Updates a specific milestone's field
   */
  const updateMilestone = useCallback((index: number, field: 'title' | 'amount', value: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }, [milestones, onChange]);

  /**
   * Calculates the total of all milestone amounts
   */
  const calculateTotal = (): number => {
    return milestones.reduce((sum, m) => {
      const amount = parseFloat(m.amount);
      return isNaN(amount) ? sum : sum + amount;
    }, 0);
  };

  /**
   * Validates a specific milestone's title
   */
  const validateTitle = (title: string): string | undefined => {
    const sanitized = sanitizeUserText(title, MAX_MILESTONE_TITLE_LENGTH);
    if (!sanitized) {
      return 'Milestone title is required';
    }
    if (sanitizeUserText(title, Number.MAX_SAFE_INTEGER).length > MAX_MILESTONE_TITLE_LENGTH) {
      return `Title must be no more than ${MAX_MILESTONE_TITLE_LENGTH} characters`;
    }
    return undefined;
  };

  /**
   * Validates a specific milestone's amount
   */
  const validateAmount = (amount: string): string | undefined => {
    if (!amount.trim()) {
      return 'Milestone amount is required';
    }
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      return 'Amount must be a positive number';
    }
    return undefined;
  };

  const total = calculateTotal();
  const canAddMore = milestones.length < MAX_MILESTONES;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Milestones <span className="text-red-500 ml-1" aria-hidden="true">*</span>
        </label>
        {error && (
          <p id="milestones-error" className="mb-2 text-sm text-red-600 font-medium" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {milestones.map((milestone, index) => {
          const titleError = validateTitle(milestone.title);
          const amountError = validateAmount(milestone.amount);
          
          return (
            <div
              key={milestone.id}
              className="p-4 border border-slate-200 rounded-lg bg-white"
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  Milestone {index + 1}
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => moveMilestoneUp(index)}
                    disabled={index === 0}
                    className="text-slate-600 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
                    aria-label={`Move milestone ${index + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMilestoneDown(index)}
                    disabled={index === milestones.length - 1}
                    className="text-slate-600 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
                    aria-label={`Move milestone ${index + 1} down`}
                  >
                    ↓
                  </button>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMilestone(index)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-500 rounded ml-2"
                      aria-label={`Remove milestone ${index + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Title"
                  id={`milestone-title-${index}`}
                  error={titleError}
                  validate={validateTitleField}
                  required
                >
                  <input
                    type="text"
                    value={milestone.title}
                    onChange={(e) => updateMilestone(index, 'title', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Design Phase"
                  />
                </FormField>

                <FormField
                  label="Amount"
                  id={`milestone-amount-${index}`}
                  error={amountError}
                  validate={validateAmountField}
                  required
                >
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                      {currencySymbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={milestone.amount}
                      onChange={(e) => updateMilestone(index, 'amount', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                </FormField>
              </div>
            </div>
          );
        })}
      </div>

      {canAddMore && (
        <button
          type="button"
          onClick={addMilestone}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
        >
          + Add Another Milestone
        </button>
      )}

      {!canAddMore && (
        <p className="text-sm text-slate-500">
          Maximum of {MAX_MILESTONES} milestones reached
        </p>
      )}

      <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-slate-700">Total:</span>
          <span className="text-lg font-semibold text-slate-900">
            {currencySymbol}{total.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};
