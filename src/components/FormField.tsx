import React from 'react';

interface FormFieldProps {
  label: string;
  id: string;
  error?: string;
  helperText?: string;
  children: React.ReactElement;
  required?: boolean;
}

/**
 * A wrapper component for form fields that provides accessible labels, 
 * helper text, and error messages.
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  id,
  error,
  helperText,
  children,
  required,
}) => {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  
  // Combine IDs for aria-describedby
  const describedBy = [
    error ? errorId : null,
    helperText ? helperId : null,
  ]
    .filter(Boolean)
    .join(' ');

  // Inject accessibility props into the child element
  const child = React.cloneElement(children, {
    id,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': !!error,
    className: `${children.props.className || ''} ${
      error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
    }`.trim(),
  });

  return (
    <div className="mb-4 w-full">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {child}
      {helperText && (
        <p id={helperId} className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
