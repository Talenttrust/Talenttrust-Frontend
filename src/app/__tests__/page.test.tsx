'use client';

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
    expect(screen.getByRole('form')).toHaveAttribute('novalidate');
  });

  it('shows error summary and per-field errors when submitting empty form', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
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
    expect(screen.getByText(/email must be valid/i)).toBeInTheDocument();
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
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
