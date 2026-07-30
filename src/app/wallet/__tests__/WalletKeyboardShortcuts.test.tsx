import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import WalletPage from '../page';
import { listWalletItems, deleteWalletItems } from '@/lib/repository';
import { ToastProvider } from '@/components/toast/toast-provider';
import { PreferencesProvider } from '@/lib/preferences';
import type { WalletItem } from '@/types/domain';

jest.mock('@/lib/repository', () => ({
  listWalletItems: jest.fn(),
  saveWalletItem: jest.fn(),
  updateWalletItem: jest.fn(),
  deleteWalletItems: jest.fn(),
}));

const mockListWalletItems = jest.mocked(listWalletItems);
const mockDeleteWalletItems = jest.mocked(deleteWalletItems);

const ITEMS: WalletItem[] = [
  {
    id: 'w-1',
    name: 'Stellar Lumens (XLM)',
    type: 'Native Asset',
    balance: 12500,
    currency: 'XLM',
    status: 'Active',
    createdAt: '2026-01-15',
  },
  {
    id: 'w-2',
    name: 'USD Coin (USDC)',
    type: 'Stablecoin',
    balance: 3200,
    currency: 'USDC',
    status: 'Pending',
    createdAt: '2026-02-01',
  },
];

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <PreferencesProvider>
      <ToastProvider>{ui}</ToastProvider>
    </PreferencesProvider>
  );
};

describe('WalletPage keyboard shortcuts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListWalletItems.mockReturnValue(ITEMS);
    mockDeleteWalletItems.mockReturnValue(true);
  });

  it('renders discoverable hints for the shortcuts when items exist', () => {
    renderWithProviders(<WalletPage />);
    expect(screen.getByLabelText('Ctrl+Shift+A — select all')).toBeInTheDocument();
    expect(screen.getByLabelText('Ctrl+Shift+E — export selected')).toBeInTheDocument();
  });

  it('Ctrl+Shift+A selects all wallet items', () => {
    renderWithProviders(<WalletPage />);

    fireEvent.keyDown(document, { key: 'a', ctrlKey: true, shiftKey: true });

    expect(screen.getByTestId('select-all-checkbox')).toBeChecked();
  });

  it('Ctrl+Shift+A again clears the selection (toggle)', () => {
    renderWithProviders(<WalletPage />);

    fireEvent.keyDown(document, { key: 'a', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('select-all-checkbox')).toBeChecked();

    fireEvent.keyDown(document, { key: 'a', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('select-all-checkbox')).not.toBeChecked();
  });

  it('plain Ctrl+A (no Shift) does not trigger select-all — avoids clashing with browser text selection', () => {
    renderWithProviders(<WalletPage />);

    fireEvent.keyDown(document, { key: 'a', ctrlKey: true, shiftKey: false });

    expect(screen.getByTestId('select-all-checkbox')).not.toBeChecked();
  });

  it('Ctrl+Shift+E exports selected items', () => {
    renderWithProviders(<WalletPage />);

    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    fireEvent.keyDown(document, { key: 'e', ctrlKey: true, shiftKey: true });

    expect(screen.getByText('Export successful')).toBeInTheDocument();
  });

  it('shortcuts are ignored while an inline edit input has focus', () => {
    renderWithProviders(<WalletPage />);

    fireEvent.click(screen.getByRole('button', { name: /edit stellar lumens/i }));
    const nameInput = screen.getByDisplayValue('Stellar Lumens (XLM)');
    nameInput.focus();

    fireEvent.keyDown(nameInput, { key: 'a', ctrlKey: true, shiftKey: true });

    expect(screen.getByTestId('select-all-checkbox')).not.toBeChecked();
  });

  it('Meta+Shift+A (Mac) also selects all', () => {
    renderWithProviders(<WalletPage />);

    fireEvent.keyDown(document, { key: 'a', metaKey: true, shiftKey: true });

    expect(screen.getByTestId('select-all-checkbox')).toBeChecked();
  });
});
