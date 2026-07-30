'use client';

import { useState, useCallback } from 'react';
import type { ValidationError } from '@/lib/validateLogin';

/**
 * Return type for the `useFormValidation` hook.
 *
 * Provides a shared pattern for managing form validation errors,
 * running validators on submit, and clearing per-field errors as the
 * user types — replacing the duplicated `errors` state, `setErrors`,
 * and submit-time validation logic across multiple forms.
 */
export interface UseFormValidationReturn {
  /**
   * The current list of validation errors.
   *
   * Rendered by `ErrorSummary` (which auto-focuses on mount when
   * `errors.length` changes from 0 to non-zero) and queried by
   * individual `FormField` components to show per-field inline errors.
   */
  errors: ValidationError[];
  /**
   * Runs the provided validator function and routes control flow:
   *
   * 1. Calls `validator()` to obtain the latest errors.
   * 2. Sets `errors` state (so `ErrorSummary` re-renders and focuses).
   * 3. If errors are present, calls `onError?.(errors)` and returns.
   * 4. If no errors, calls `onSuccess()`.
   *
   * The validator is a zero-argument callback so it closes over the
   * latest form field values without requiring them as explicit
   * parameters.
   *
   * @param validator - A function that evaluates the current form
   *                    state and returns `ValidationError[]`.
   * @param onSuccess - Called when validation passes (empty errors).
   * @param onError   - Optional callback invoked with the errors array
   *                    when validation fails (e.g. for screen-reader
   *                    announcements).
   */
  validateAndSubmit: (
    validator: () => ValidationError[],
    onSuccess: () => void,
    onError?: (errors: ValidationError[]) => void,
  ) => void;
  /**
   * Removes all errors whose `fieldId` matches the given value.
   *
   * Typically wired to an input's `onChange` so the inline error for
   * that field disappears as soon as the user starts correcting it,
   * without affecting errors on other fields.
   *
   * @param fieldId - The `fieldId` to clear from the errors list.
   *
   * @example
   * ```tsx
   * <input
   *   onChange={(e) => {
   *     setEmail(e.target.value);
   *     clearFieldError('email');
   *   }}
   * />
   * ```
   */
  clearFieldError: (fieldId: string) => void;
  /**
   * Replaces any existing error for the given `fieldId` with the
   * provided error object. Useful when an external component (e.g.
   * `WalletAddressInput`) pushes errors back into the form's
   * validation state after blur.
   *
   * @param error - The `ValidationError` to set. If the error's
   *                `message` is empty the field is effectively cleared.
   *
   * @example
   * ```tsx
   * setFieldError({ fieldId: 'freelancerAddress', message: 'Invalid address' });
   * ```
   */
  setFieldError: (error: ValidationError) => void;
}

/**
 * `useFormValidation` — a shared hook for form validation state and
 * submit-time validation routing.
 *
 * ## Motivation
 *
 * `ContractCreationForm`, `CreateContractForm`,
 * `MilestoneCreationForm`, and the login form in `src/app/page.tsx`
 * each re-implement the same `errors` state, submit-time validation,
 * and `ErrorSummary` focus handoff. This hook extracts the common
 * pattern so accessibility regressions (e.g. missing focus management,
 * duplicated error sets) are prevented at the single source of truth.
 *
 * ## Usage
 *
 * ```tsx
 * const { errors, validateAndSubmit, clearFieldError } = useFormValidation();
 *
 * const handleSubmit = (e: FormEvent) => {
 *   e.preventDefault();
 *   validateAndSubmit(
 *     () => validateLogin(email, password),
 *     () => {
 *       // Submission succeeded — reset form, show toast, etc.
 *     },
 *   );
 * };
 * ```
 *
 * ## ErrorSummary focus behaviour
 *
 * `ErrorSummary` focuses itself via `useEffect` when `errors.length`
 * changes. Because `validateAndSubmit` calls `setErrors` with a **new
 * array reference** each time (even when the length / contents are
 * identical to the previous submission), the `useEffect` in
 * `ErrorSummary` fires reliably on every submit — matching the
 * byte-for-byte behaviour of the original inline `setErrors` calls.
 *
 * @returns `{ errors, validateAndSubmit, clearFieldError }`
 */
export function useFormValidation(): UseFormValidationReturn {
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const validateAndSubmit = useCallback(
    (
      validator: () => ValidationError[],
      onSuccess: () => void,
      onError?: (errors: ValidationError[]) => void,
    ) => {
      const validationErrors = validator();
      setErrors(validationErrors);

      if (validationErrors.length > 0) {
        onError?.(validationErrors);
        return;
      }

      onSuccess();
    },
    [],
  );

  const clearFieldError = useCallback((fieldId: string) => {
    setErrors((prev) => prev.filter((e) => e.fieldId !== fieldId));
  }, []);

  const setFieldError = useCallback((error: ValidationError) => {
    setErrors((prev) => {
      const filtered = prev.filter((e) => e.fieldId !== error.fieldId);
      return [...filtered, error];
    });
  }, []);

  return { errors, validateAndSubmit, clearFieldError, setFieldError };
}
