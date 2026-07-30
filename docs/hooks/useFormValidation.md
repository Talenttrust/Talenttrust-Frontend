# useFormValidation

A shared React hook that manages form validation state, submit-time validation routing, and per-field error clearing. Extracted from the duplicated `errors` state, `setErrors`, and `ErrorSummary` focus-handoff logic that was repeated across `ContractCreationForm`, `CreateContractForm`, `MilestoneCreationForm`, and the login form.

## Motivation

Four forms in the codebase each re-implemented the same pattern:

```tsx
const [errors, setErrors] = useState<ValidationError[]>([]);

const handleSubmit = (e) => {
  e.preventDefault();
  const validationErrors = validateForm();
  setErrors(validationErrors);
  if (validationErrors.length > 0) return;
  // ... submit logic ...
};
```

This duplication made accessibility regressions (e.g. missing `ErrorSummary` focus management, inconsistent error-clear behaviour) easy to introduce in one form but not others. `useFormValidation` extracts the shared pattern into a single, tested source of truth.

## Return Value

```tsx
const { errors, validateAndSubmit, clearFieldError, setFieldError } = useFormValidation();
```

| Member             | Type                                                                  | Description                                                                                             |
|--------------------|-----------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `errors`           | `ValidationError[]`                                                   | The current list of validation errors. Rendered by `ErrorSummary` and queried by individual `FormField` components. |
| `validateAndSubmit`| `(validator, onSuccess, onError?) => void`                            | Runs the validator, sets errors state, and routes control flow to `onSuccess` (valid) or `onError` (invalid). |
| `clearFieldError`  | `(fieldId: string) => void`                                           | Removes all errors whose `fieldId` matches — typically wired to an input's `onChange`.                 |
| `setFieldError`    | `(error: ValidationError) => void`                                    | Replaces any existing error for a given fieldId. Useful when external components (e.g. `WalletAddressInput`) push errors back into the form. |

## Usage

### Basic form

```tsx
import { useFormValidation } from '@/hooks/useFormValidation';
import { ErrorSummary } from '@/components/ErrorSummary';
import { FormField } from '@/components/FormField';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { errors, validateAndSubmit, clearFieldError } = useFormValidation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateAndSubmit(
      () => validateLogin(email, password),  // validator
      () => {
        // ✅ onSuccess — validation passed
        submitLogin(email, password);
      },
      (validationErrors) => {
        // ❌ onError — validation failed (optional)
        announce({
          message: `${validationErrors.length} error(s) found.`,
          type: 'error',
        });
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <ErrorSummary errors={errors} />
      <FormField label="Email" id="email" error={errors.find(e => e.fieldId === 'email')?.message}>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
        />
      </FormField>
      <button type="submit">Submit</button>
    </form>
  );
}
```

### With external validation (e.g. `WalletAddressInput`)

```tsx
function CreateContractForm({ onSuccess }) {
  const { errors, validateAndSubmit, clearFieldError, setFieldError } = useFormValidation();

  const handleWalletValidation = useCallback(
    (fieldId: string, error: string | null) => {
      if (error) {
        setFieldError({ fieldId, message: error });
      } else {
        clearFieldError(fieldId);
      }
    },
    [clearFieldError, setFieldError],
  );

  // ...
}
```

## ErrorSummary Focus Behaviour

`ErrorSummary` focuses itself via `useEffect` when `errors.length` changes:

```tsx
useEffect(() => {
  if (errors.length > 0) {
    summaryRef.current?.focus();
  }
}, [errors.length]);
```

Because `validateAndSubmit` calls `setErrors` with a **new array reference** each time (even when the length and contents are identical to the previous submission), the `useEffect` fires reliably on every submit — matching the byte-for-byte behaviour of the original inline `setErrors` calls.

## Type

The hook is typed against the `ValidationError` interface from `@/lib/validateLogin`:

```ts
export interface ValidationError {
  fieldId: string;
  message: string;
}
```

## Testing

The hook is tested in `src/hooks/__tests__/useFormValidation.test.tsx` with coverage for:

- **Initial state**: errors is `[]` on mount
- **validateAndSubmit — success**: calls `onSuccess`, does not call `onError`, clears previous errors
- **validateAndSubmit — failure**: sets errors, does not call `onSuccess`, calls `onError` with the errors array
- **clearFieldError**: removes a single field's error, no-op for non-existent fields or empty errors
- **setFieldError**: adds new errors, replaces existing ones for the same fieldId, preserves other fields
- **Multiple submissions**: errors are replaced, not accumulated
- **Instance isolation**: each hook instance maintains independent state
- **Edge cases**: empty validators, large number of errors, void return value
