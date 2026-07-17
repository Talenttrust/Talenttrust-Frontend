import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../page';
import { PreferencesProvider } from '@/lib/preferences';
import { ToastProvider } from '@/components/toast/toast-provider';
import { assertNoA11yViolations } from '@/test-utils/a11y';

// Mock wallet is already mocked in jest.setup.js
// Mock next/navigation if needed (not needed for this test

function renderHome() {
  return render(
    <PreferencesProvider>
      <ToastProvider>
        <Home />
      </ToastProvider>
    </PreferencesProvider>
  );
}

describe('Home Page Login Form', () => {
  it('has no a11y violations', async () => {
    const { container } = renderHome();
    await assertNoA11yViolations(container);
  });

  it('form has noValidate attribute', () => {
    renderHome();
    // Forms don't have implicit role="form" — use getByRole('button').closest('form') instead
    const form = screen.getByRole('button', { name: /sign in/i }).closest('form');
    expect(form).toHaveAttribute('novalidate');
  });

  it('shows error summary and per-field errors when submitting empty form', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    // ErrorSummary has aria-labelledby="error-summary-title" to differentiate from FormField alerts
    expect(screen.getByRole('alert', { name: /there is a problem/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInvalid();
    expect(screen.getByLabelText(/password/i)).toBeInvalid();
  });

  it('shows per-field errors for invalid email and short password', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByLabelText(/email/i), 'invalid-email');
    await user.type(screen.getByLabelText(/password/i), '1234567');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Check per-field errors
    expect(screen.getByLabelText(/email/i)).toBeInvalid();
    expect(screen.getByLabelText(/password/i)).toBeInvalid();
    // Use getElementById to get the specific error element, not the ErrorSummary anchor
    expect(document.getElementById('email-error')).toHaveTextContent('Email must be valid');
    expect(document.getElementById('password-error')).toHaveTextContent('Password must be at least 8 characters');
  });

  it('shows success toast when valid email and password submitted', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('status')).toBeInTheDocument(); // toast
  });
});
