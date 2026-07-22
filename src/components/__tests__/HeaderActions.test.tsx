import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import HeaderActions from '../HeaderActions';

jest.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

jest.mock('@/components/WalletConnectButton', () => ({
  WalletConnectButton: () => <button type="button">Wallet Button</button>,
}));

describe('HeaderActions', () => {
  it('renders the mobile disclosure disclosure button and wallet action wrapper', () => {
    render(<HeaderActions />);

    expect(screen.getByRole('button', { name: /open wallet actions/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /wallet actions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wallet button/i })).toBeInTheDocument();
  });

  it('toggles aria-expanded and menu visibility when clicked', () => {
    render(<HeaderActions />);
    const toggle = screen.getByRole('button', { name: /open wallet actions/i });
    const menu = screen.getByRole('region', { name: /wallet actions/i });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveClass('hidden');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(menu).not.toHaveClass('hidden');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveClass('hidden');
  });

  it('responds to keyboard-accessible activation', async () => {
    const user = userEvent.setup();
    render(<HeaderActions />);
    const toggle = screen.getByRole('button', { name: /open wallet actions/i });
    const menu = screen.getByRole('region', { name: /wallet actions/i });

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(menu).not.toHaveClass('hidden');

    await user.keyboard('[Space]');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveClass('hidden');
  });

  it('includes aria-controls that matches the menu id', () => {
    render(<HeaderActions />);
    const toggle = screen.getByRole('button', { name: /open wallet actions/i });
    const menu = screen.getByRole('region', { name: /wallet actions/i });

    expect(toggle).toHaveAttribute('aria-controls', menu.id);
    expect(menu.id).toBe('header-wallet-actions');
  });

  it('unmounts cleanly without errors', () => {
    const { unmount } = render(<HeaderActions />);
    expect(() => unmount()).not.toThrow();
  });
});
