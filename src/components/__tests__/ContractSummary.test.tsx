import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ContractSummary from '../ContractSummary';
import { PreferencesProvider } from '@/lib/preferences';
import { testA11y } from '@/test-utils/a11y';

function renderWithPrefs(
  ui: React.ReactElement,
  prefs: Record<string, unknown> = {}
) {
  localStorage.setItem(
    'talenttrust-user-preferences',
    JSON.stringify({ amountFormat: 'usd', ...prefs })
  );
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}

const defaultProps = {
  contractName: 'Escrow Contract',
  parties: [
    { label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' },
    { label: 'Freelancer', address: 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210' },
  ],
  totalValue: 1200,
  currency: 'USD',
  status: 'Active' as const,
  createdAt: 'May 1, 2026',
  milestoneCount: 2,
};

describe('ContractSummary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders contract name and party addresses truncated', async () => {
    renderWithPrefs(<ContractSummary {...defaultProps} />);

    expect(screen.getByText('Escrow Contract')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Freelancer')).toBeInTheDocument();
    expect(screen.getByText(/GABC12...7890/)).toBeInTheDocument();
    expect(screen.getByText(/GXYZ98...3210/)).toBeInTheDocument();
  });

  it('renders status badge reflecting the passed status', async () => {
    renderWithPrefs(<ContractSummary {...defaultProps} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Active');
    expect(badge).toHaveAttribute('aria-label', 'Status: Active');
  });

  it('formats total with default USD', async () => {
    renderWithPrefs(<ContractSummary {...defaultProps} />);

    const expected = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(1200);

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('formats total with NGN override', async () => {
    renderWithPrefs(<ContractSummary {...defaultProps} />, {
      amountFormat: 'ngn',
    });

    const expected = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(1200);

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('formats total with compact notation', async () => {
    renderWithPrefs(<ContractSummary {...defaultProps} />, {
      amountFormat: 'compact',
    });

    const expected = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      style: 'currency',
      currency: 'USD',
    }).format(1200);

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('displays correct milestone count for zero milestones', async () => {
    renderWithPrefs(
      <ContractSummary {...defaultProps} milestoneCount={0} />
    );

    expect(await screen.findByText('0 milestones')).toBeInTheDocument();
  });

  it('displays correct milestone count for single milestone', async () => {
    renderWithPrefs(
      <ContractSummary {...defaultProps} milestoneCount={1} />
    );

    expect(await screen.findByText('1 milestone')).toBeInTheDocument();
  });

  it('renders with very long addresses', async () => {
    const longAddress =
      'GABC1234DEF5678HIJK9012LMNO3456PQRS7890WXYZ1234EXTRA';
    renderWithPrefs(
      <ContractSummary
        {...defaultProps}
        parties={[{ label: 'Client', address: longAddress }]}
      />
    );

    expect(await screen.findByText('GABC12...XTRA')).toBeInTheDocument();
  });

  it('associates the section via aria-labelledby', async () => {
    renderWithPrefs(<ContractSummary {...defaultProps} />);

    const section = document.querySelector('section');
    expect(section).toHaveAttribute(
      'aria-labelledby',
      'contract-summary-title'
    );
    const heading = document.getElementById('contract-summary-title');
    expect(heading).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    await testA11y(
      <PreferencesProvider>
        <ContractSummary {...defaultProps} />
      </PreferencesProvider>
    );
  });
});
