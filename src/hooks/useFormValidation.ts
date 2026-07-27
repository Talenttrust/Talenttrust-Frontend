import { useState, useCallback } from 'react';
import type { ValidationError } from '@/lib/validateLogin';

/**
 * Configuration options for the useFormValidation hook.
 */
export interface UseFormValidationOptions<T> {
  /**
   * The validation function that takes form values and returns an array of validation errors.
   * This function should be pure and side-effect-free.
   */
  validate: (values: T) => ValidationError[];
  /**
   * The current form values to validate. When these change, the validation
   * function will be called with the updated values.
   */
  values: T;
}

/**
 * Return value from the useFormValidation hook.
 */
export interface UseFormValidationReturn {
  /**
   * The current array of validation errors.
   */
  errors: ValidationError[];
  /**
   * Validates the current form values and updates the errors state.
   * Returns true if there are no errors, false otherwise.
   */
  validateForm: () => boolean;
  /**
   * Clears the error for a specific field by fieldId.
   * Useful for clearing errors as the user types in a field.
   */
  clearFieldError: (fieldId: string) => void;
  /**
   * Sets the error for a specific field. Useful for custom validation
   * that happens outside the main validation function (e.g., async validation).
   */
  setFieldError: (fieldId: string, message: string | null) => void;
  /**
   * Gets the error message for a specific field by fieldId.
   * Returns undefined if there is no error for that field.
   */
  getFieldError: (fieldId: string) => string | undefined;
  /**
   * Clears all validation errors.
   */
  clearAllErrors: () => void;
}

/**
 * A reusable hook for managing form validation state and logic.
 *
 * This hook encapsulates the common validation patterns used across forms:
 * - Maintains an errors array
 * - Provides validation function
 * - Provides field-level error clearing
 * - Provides field-level error retrieval
 *
 * @example
 * ```tsx
 * const { errors, validateForm, clearFieldError, getFieldError } = useFormValidation({
 *   validate: validateContract,
 *   values: { contractName, freelancerAddress, totalValue, currency },
 * });
 *
 * const handleSubmit = (e) => {
 *   e.preventDefault();
 *   if (validateForm()) {
 *     // Submit form
 *   }
 * };
 *
 * <input
 *   value={contractName}
 *   onChange={(e) => {
 *     setContractName(e.target.value);
 *     clearFieldError('contractName');
 *   }}
 * />
 * ```
 */
export function useFormValidation<T>({
  validate,
  values,
}: UseFormValidationOptions<T>): UseFormValidationReturn {
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const validateForm = useCallback((): boolean => {
    const validationErrors = validate(values);
    setErrors(validationErrors);
    return validationErrors.length === 0;
  }, [validate, values]);

  const clearFieldError = useCallback((fieldId: string) => {
    setErrors((prev: ValidationError[]) => prev.filter((err: ValidationError) => err.fieldId !== fieldId));
  }, []);

  const setFieldError = useCallback((fieldId: string, message: string | null) => {
    setErrors((prev: ValidationError[]) => {
      const filtered = prev.filter((e: ValidationError) => e.fieldId !== fieldId);
      if (message) {
        return [...filtered, { fieldId, message }];
      }
      return filtered;
    });
  }, []);

  const getFieldError = useCallback(
    (fieldId: string): string | undefined => {
      return errors.find((e: ValidationError) => e.fieldId === fieldId)?.message;
    },
    [errors]
  );

  const clearAllErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    errors,
    validateForm,
    clearFieldError,
    setFieldError,
    getFieldError,
    clearAllErrors,
  };
}
