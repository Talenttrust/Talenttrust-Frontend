import React, { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { assertNoA11yViolations } from '@/test-utils/a11y';
import { ErrorSummary } from '../ErrorSummary';

const exampleErrors = [
  { fieldId: 'full-name', message: 'Enter your full name.' },
  { fieldId: 'email', message: 'Enter a valid email address.' },
];

function ErrorSummaryHarness() {
  const [errors, setErrors] = useState<{ fieldId: string; message: string }[]>([]);

  return (
    <>
      <button type="button" onClick={() => setErrors(exampleErrors)}>
        Show errors
      </button>
      <ErrorSummary errors={errors} />
    </>
  );
}

describe('ErrorSummary', () => {
  it('renders nothing when there are no errors', () => {
    const { container } = render(<ErrorSummary errors={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders an alert region that can receive programmatic focus', () => {
    render(<ErrorSummary errors={exampleErrors} />);

    const summary = screen.getByRole('alert');

    expect(summary).toHaveAttribute('tabIndex', '-1');
    expect(summary).toHaveAccessibleName('There is a problem');
  });

  it('focuses the summary when errors transition from empty to populated', async () => {
    render(<ErrorSummaryHarness />);

    screen.getByRole('button', { name: /show errors/i }).focus();
    expect(screen.getByRole('button', { name: /show errors/i })).toHaveFocus();

    await act(async () => {
      screen.getByRole('button', { name: /show errors/i }).click();
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
  });

  it('renders each error as an anchor link to the invalid field id', () => {
    render(<ErrorSummary errors={exampleErrors} />);

    expect(screen.getByRole('link', { name: 'Enter your full name.' })).toHaveAttribute('href', '#full-name');
    expect(screen.getByRole('link', { name: 'Enter a valid email address.' })).toHaveAttribute('href', '#email');
  });

  it('renders duplicate field ids as separate list items with matching anchors', () => {
    render(
      <ErrorSummary
        errors={[
          { fieldId: 'milestone-title', message: 'Enter a title.' },
          { fieldId: 'milestone-title', message: 'Title must be under 80 characters.' },
        ]}
      />
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Enter a title.' })).toHaveAttribute('href', '#milestone-title');
    expect(screen.getByRole('link', { name: 'Title must be under 80 characters.' })).toHaveAttribute('href', '#milestone-title');
  });

  it('has no axe violations when errors are shown', async () => {
    const { container } = render(<ErrorSummary errors={exampleErrors} />);

    await assertNoA11yViolations(container);
  });
});
