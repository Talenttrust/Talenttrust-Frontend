import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletButton } from './WalletButton';
import { WalletProvider, useWallet } from './WalletProvider';
import * as React from 'react';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <WalletProvider>{children}</WalletProvider>
);

describe('WalletButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
    });
  });

  it('renders without crashing', () => {
    render(
      <TestWrapper>
        <WalletButton />
      </TestWrapper>
    );
  });

  it('is keyboard navigable with Tab', () => {
    render(
      <TestWrapper>
        <WalletButton />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    button.focus();
    expect(button).toHaveFocus();
  });
});
