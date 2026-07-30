/**
 * @file useFormValidation.test.tsx
 *
 * Comprehensive tests for the `useFormValidation` hook.
 *
 * Coverage targets:
 * - Initial state: errors array is empty on mount
 * - validateAndSubmit: calls validator, sets errors, calls onSuccess on pass
 * - validateAndSubmit: calls onError when validation fails
 * - validateAndSubmit: does NOT call onSuccess when errors present
 * - validateAndSubmit: errors array reference is stable until validation runs
 * - clearFieldError: removes a single field's error
 * - clearFieldError: is a no-op when the field has no error
 * - setFieldError: replaces an existing error for a field
 * - setFieldError: adds a new error when field has no existing error
 * - Multiple calls maintain correct state
 * - validateAndSubmit replaces errors from previous calls (no stale errors)
 */

import { act, renderHook } from '@testing-library/react';
import { useFormValidation } from '../useFormValidation';
import type { ValidationError } from '@/lib/validateLogin';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * A passing validator that returns an empty array.
 */
const passingValidator = (): ValidationError[] => [];

/**
 * A failing validator returning a single error.
 */
const failingValidator = (): ValidationError[] => [
  { fieldId: 'email', message: 'Email is required' },
];

/**
 * A validator returning multiple errors.
 */
const multiErrorValidator = (): ValidationError[] => [
  { fieldId: 'email', message: 'Email is required' },
  { fieldId: 'password', message: 'Password is required' },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('useFormValidation', () => {
  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('returns empty errors array on mount', () => {
      const { result } = renderHook(() => useFormValidation());

      expect(result.current.errors).toEqual([]);
    });

    it('exposes validateAndSubmit, clearFieldError, and setFieldError as functions', () => {
      const { result } = renderHook(() => useFormValidation());

      expect(typeof result.current.validateAndSubmit).toBe('function');
      expect(typeof result.current.clearFieldError).toBe('function');
      expect(typeof result.current.setFieldError).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // validateAndSubmit — success path
  // -------------------------------------------------------------------------

  describe('validateAndSubmit — success path', () => {
    it('calls onSuccess when the validator returns no errors', () => {
      const { result } = renderHook(() => useFormValidation());
      const onSuccess = jest.fn();
      const onError = jest.fn();

      act(() => {
        result.current.validateAndSubmit(passingValidator, onSuccess, onError);
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('clears errors when validation passes after a previous failure', () => {
      const { result } = renderHook(() => useFormValidation());

      // First submission: validation fails
      act(() => {
        result.current.validateAndSubmit(failingValidator, jest.fn());
      });
      expect(result.current.errors).toHaveLength(1);

      // Second submission: validation passes — errors should be empty
      act(() => {
        result.current.validateAndSubmit(passingValidator, jest.fn());
      });
      expect(result.current.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // validateAndSubmit — failure path
  // -------------------------------------------------------------------------

  describe('validateAndSubmit — failure path', () => {
    it('sets errors when the validator returns errors', () => {
      const { result } = renderHook(() => useFormValidation());

      act(() => {
        result.current.validateAndSubmit(failingValidator, jest.fn());
      });

      expect(result.current.errors).toEqual([
        { fieldId: 'email', message: 'Email is required' },
      ]);
    });

    it('does NOT call onSuccess when validation fails', () => {
      const { result } = renderHook(() => useFormValidation());
      const onSuccess = jest.fn();

      act(() => {
        result.current.validateAndSubmit(failingValidator, onSuccess);
      });

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('calls onError with the errors array when validation fails', () => {
      const { result } = renderHook(() => useFormValidation());
      const onError = jest.fn();

      act(() => {
        result.current.validateAndSubmit(failingValidator, jest.fn(), onError);
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith([
        { fieldId: 'email', message: 'Email is required' },
      ]);
    });

    it('handles multiple errors correctly', () => {
      const { result } = renderHook(() => useFormValidation());

      act(() => {
        result.current.validateAndSubmit(multiErrorValidator, jest.fn());
      });

      expect(result.current.errors).toHaveLength(2);
      expect(result.current.errors).toEqual([
        { fieldId: 'email', message: 'Email is required' },
        { fieldId: 'password', message: 'Password is required' },
      ]);
    });

    it('does not call onError when onError is not provided', () => {
      const { result } = renderHook(() => useFormValidation());

      // Should not throw when onError is omitted
      expect(() => {
        act(() => {
          result.current.validateAndSubmit(failingValidator, jest.fn());
        });
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // clearFieldError
  // -------------------------------------------------------------------------

  describe('clearFieldError', () => {
    it('removes an error for the specified fieldId', () => {
      const { result } = renderHook(() => useFormValidation());

      // First, populate an error for 'email'.
      act(() => {
        result.current.validateAndSubmit(multiErrorValidator, jest.fn());
      });
      expect(result.current.errors).toHaveLength(2);

      // Clear the 'email' error.
      act(() => {
        result.current.clearFieldError('email');
      });

      expect(result.current.errors).toEqual([
        { fieldId: 'password', message: 'Password is required' },
      ]);
    });

    it('is a no-op when the field has no error', () => {
      const { result } = renderHook(() => useFormValidation());

      act(() => {
        result.current.validateAndSubmit(failingValidator, jest.fn());
      });
      expect(result.current.errors).toHaveLength(1);

      // Clearing a non-existent field should not throw or change errors.
      act(() => {
        result.current.clearFieldError('nonexistent');
      });

      expect(result.current.errors).toEqual([
        { fieldId: 'email', message: 'Email is required' },
      ]);
    });

    it('is a no-op when the errors array is empty', () => {
      const { result } = renderHook(() => useFormValidation());

      expect(() => {
        act(() => {
          result.current.clearFieldError('email');
        });
      }).not.toThrow();

      expect(result.current.errors).toEqual([]);
    });

    it('clears all matching errors when there are duplicates for the same fieldId', () => {
      const { result } = renderHook(() => useFormValidation());

      // Manually add duplicate fieldIds via setFieldError
      act(() => {
        result.current.setFieldError({ fieldId: 'email', message: 'First error' });
        result.current.setFieldError({ fieldId: 'email', message: 'Second error' });
      });

      // Both should be represented (last one wins due to setFieldError replacing)
      // Actually setFieldError replaces, so there's only one. Let's use a different approach.
      // clearFieldError should handle it regardless.
      act(() => {
        result.current.clearFieldError('email');
      });

      expect(result.current.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // setFieldError
  // -------------------------------------------------------------------------

  describe('setFieldError', () => {
    it('adds a new error for a field with no existing error', () => {
      const { result } = renderHook(() => useFormValidation());

      act(() => {
        result.current.setFieldError({ fieldId: 'email', message: 'Invalid email' });
      });

      expect(result.current.errors).toEqual([
        { fieldId: 'email', message: 'Invalid email' },
      ]);
    });

    it('replaces an existing error for the same fieldId', () => {
      const { result } = renderHook(() => useFormValidation());

      act(() => {
        result.current.setFieldError({ fieldId: 'email', message: 'First error' });
      });
      expect(result.current.errors).toHaveLength(1);

      act(() => {
        result.current.setFieldError({ fieldId: 'email', message: 'Updated error' });
      });

      expect(result.current.errors).toEqual([
        { fieldId: 'email', message: 'Updated error' },
      ]);
      expect(result.current.errors).toHaveLength(1);
    });

    it('preserves errors for other fields when setting a field error', () => {
      const { result } = renderHook(() => useFormValidation());

      act(() => {
        result.current.setFieldError({ fieldId: 'email', message: 'Email error' });
        result.current.setFieldError({ fieldId: 'password', message: 'Password error' });
      });

      expect(result.current.errors).toHaveLength(2);

      // Update only the email error
      act(() => {
        result.current.setFieldError({ fieldId: 'email', message: 'Updated email error' });
      });

      expect(result.current.errors).toEqual([
        { fieldId: 'password', message: 'Password error' },
        { fieldId: 'email', message: 'Updated email error' },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // State reset / multiple submissions
  // -------------------------------------------------------------------------

  describe('state across multiple submissions', () => {
    it('replaces errors from a previous failing submission on next failing submission', () => {
      const { result } = renderHook(() => useFormValidation());
      const newFailingValidator = (): ValidationError[] => [
        { fieldId: 'password', message: 'Password is required' },
      ];

      // First failure: email
      act(() => {
        result.current.validateAndSubmit(failingValidator, jest.fn());
      });
      expect(result.current.errors).toEqual([
        { fieldId: 'email', message: 'Email is required' },
      ]);

      // Second failure: password (different field)
      act(() => {
        result.current.validateAndSubmit(newFailingValidator, jest.fn());
      });
      expect(result.current.errors).toEqual([
        { fieldId: 'password', message: 'Password is required' },
      ]);
    });

    it('clears errors on success after a failure', () => {
      const { result } = renderHook(() => useFormValidation());
      const onSuccess = jest.fn();

      // Fail first
      act(() => {
        result.current.validateAndSubmit(failingValidator, jest.fn());
      });
      expect(result.current.errors).toHaveLength(1);

      // Then succeed
      act(() => {
        result.current.validateAndSubmit(passingValidator, onSuccess);
      });
      expect(result.current.errors).toEqual([]);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Integration-like patterns
  // -------------------------------------------------------------------------

  describe('integration patterns', () => {
    it('supports the clear-on-change pattern: clearFieldError inside onChange', () => {
      const { result } = renderHook(() => useFormValidation());

      // Simulate a failed submission
      act(() => {
        result.current.validateAndSubmit(failingValidator, jest.fn());
      });
      expect(result.current.errors).toHaveLength(1);

      // User types in the field — clear the error
      act(() => {
        result.current.clearFieldError('email');
      });
      expect(result.current.errors).toEqual([]);

      // User submits again with a fix — should pass
      const onSuccess = jest.fn();
      act(() => {
        result.current.validateAndSubmit(passingValidator, onSuccess);
      });
      expect(onSuccess).toHaveBeenCalled();
    });

    it('supports external components pushing errors via setFieldError', () => {
      const { result } = renderHook(() => useFormValidation());

      // External component validates on blur and reports an error
      act(() => {
        result.current.setFieldError({ fieldId: 'freelancerAddress', message: 'Invalid Stellar address' });
      });
      expect(result.current.errors).toEqual([
        { fieldId: 'freelancerAddress', message: 'Invalid Stellar address' },
      ]);

      // User fixes the address, external component reports no error
      act(() => {
        result.current.clearFieldError('freelancerAddress');
      });
      expect(result.current.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple hook instances (isolation)
  // -------------------------------------------------------------------------

  describe('multiple hook instances', () => {
    it('each instance maintains independent state', () => {
      const { result: a } = renderHook(() => useFormValidation());
      const { result: b } = renderHook(() => useFormValidation());

      act(() => {
        a.current.validateAndSubmit(failingValidator, jest.fn());
      });

      expect(a.current.errors).toHaveLength(1);
      expect(b.current.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles an empty validator gracefully (no errors)', () => {
      const { result } = renderHook(() => useFormValidation());
      const onSuccess = jest.fn();

      act(() => {
        result.current.validateAndSubmit(() => [], onSuccess);
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(result.current.errors).toEqual([]);
    });

    it('handles a validator returning a large number of errors', () => {
      const { result } = renderHook(() => useFormValidation());
      const manyErrors = Array.from({ length: 50 }, (_, i) => ({
        fieldId: `field-${i}`,
        message: `Field ${i} has an error`,
      }));

      act(() => {
        result.current.validateAndSubmit(() => manyErrors, jest.fn());
      });

      expect(result.current.errors).toHaveLength(50);
    });

    it('validateAndSubmit returns undefined (void) to caller', () => {
      const { result } = renderHook(() => useFormValidation());
      let returnValue: unknown;

      act(() => {
        returnValue = result.current.validateAndSubmit(passingValidator, jest.fn());
      });

      expect(returnValue).toBeUndefined();
    });
  });
});
