import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { ErrorSummary } from '../ErrorSummary';
import { testA11y } from '@/test-utils/a11y';

const ERRORS = [
  { fieldId: 'email', message: 'Email is required' },
  { fieldId: 'password', message: 'Password must be at least 8 characters' },
];

describe('ErrorSummary', () => {
  it('renders nothing when errors is empty', () => {
    const { container } = render(<ErrorSummary errors={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an alert region with tabIndex={-1} when errors exist', () => {
    render(<ErrorSummary errors={ERRORS} />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('tabindex', '-1');
  });

  it('renders a list item anchor link for each error', () => {
    render(<ErrorSummary errors={ERRORS} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '#email');
    expect(links[0]).toHaveTextContent('Email is required');
    expect(links[1]).toHaveAttribute('href', '#password');
    expect(links[1]).toHaveTextContent('Password must be at least 8 characters');
  });

  it('focuses the container when errors transition from zero to non-zero', () => {
    function Wrapper() {
      const [errors, setErrors] = useState<typeof ERRORS>([]);
      return (
        <>
          <button onClick={() => setErrors(ERRORS)}>trigger</button>
          <ErrorSummary errors={errors} />
        </>
      );
    }

    render(<Wrapper />);
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => {
      screen.getByRole('button', { name: 'trigger' }).click();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(document.activeElement).toBe(alert);
  });

  it('re-focuses when the error list changes', () => {
    const ERRORS_2 = [{ fieldId: 'name', message: 'Name is required' }];

    function Wrapper() {
      const [errors, setErrors] = useState(ERRORS);
      return (
        <>
          <button onClick={() => setErrors(ERRORS_2)}>update</button>
          <ErrorSummary errors={errors} />
        </>
      );
    }

    render(<Wrapper />);
    const alert = screen.getByRole('alert');
    // blur first so we can verify re-focus
    (alert as HTMLElement).blur();

    act(() => {
      screen.getByRole('button', { name: 'update' }).click();
    });

    expect(document.activeElement).toBe(alert);
  });

  it('handles duplicate fieldIds with distinct keys (no React key warning)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const dupes = [
      { fieldId: 'email', message: 'First email error' },
      { fieldId: 'email', message: 'Second email error' },
    ];
    render(<ErrorSummary errors={dupes} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    // React key warning would surface here
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('key'));
    spy.mockRestore();
  });

  it('renders a single error correctly', () => {
    render(<ErrorSummary errors={[ERRORS[0]]} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAttribute('href', '#email');
  });

  it('passes axe accessibility audit when errors exist', async () => {
    await testA11y(<ErrorSummary errors={ERRORS} />);
  });

  it('passes axe accessibility audit when errors is empty', async () => {
    await testA11y(<ErrorSummary errors={[]} />);
  });
});
