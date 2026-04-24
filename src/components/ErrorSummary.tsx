import React, { useEffect, useRef } from 'react';

interface ErrorSummaryProps {
  errors: { fieldId: string; message: string }[];
}

/**
 * A component that displays a summary of all validation errors at the top of a form.
 * It provides anchor links to the invalid fields for better navigation.
 */
export const ErrorSummary: React.FC<ErrorSummaryProps> = ({ errors }) => {
  const summaryRef = useRef<HTMLDivElement>(null);

  // Focus the summary when errors appear for screen readers
  useEffect(() => {
    if (errors.length > 0) {
      summaryRef.current?.focus();
    }
  }, [errors.length]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={summaryRef}
      className="p-4 mb-6 border-l-4 border-red-500 bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
      role="alert"
      aria-labelledby="error-summary-title"
      tabIndex={-1}
    >
      <h2 id="error-summary-title" className="text-lg font-bold text-red-800">
        There is a problem
      </h2>
      <ul className="mt-2 space-y-1 list-inside text-sm text-red-700">
        {errors.map((error, index) => (
          <li key={`${error.fieldId}-${index}`}>
            <a
              href={`#${error.fieldId}`}
              className="font-medium underline hover:text-red-900 focus:text-red-900 transition-colors"
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
