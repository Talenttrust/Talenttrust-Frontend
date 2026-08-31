import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { ScreenReaderAnnouncer } from '@/components/accessibility/ScreenReaderAnnouncer';
import { announceToScreenReader } from '@/lib/accessibility/announcements';

describe('Accessible Announcements for Wallet & Escrow Updates', () => {
  it('renders polite and assertive live regions correctly', () => {
    render(<ScreenReaderAnnouncer />);
    
    act(() => {
      announceToScreenReader('Escrow milestone funded successfully', 'polite');
    });

    const politeRegion = screen.getByText('Escrow milestone funded successfully');
    expect(politeRegion).toBeInTheDocument();
    expect(politeRegion.closest('div')).toHaveAttribute('aria-live', 'polite');
  });

  it('handles assertive error announcements for failed transactions', () => {
    render(<ScreenReaderAnnouncer />);

    act(() => {
      announceToScreenReader('Wallet transaction failed', 'assertive');
    });

    const assertiveRegion = screen.getByText('Wallet transaction failed');
    expect(assertiveRegion).toBeInTheDocument();
    expect(assertiveRegion.closest('div')).toHaveAttribute('aria-live', 'assertive');
  });
});
