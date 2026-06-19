import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { testA11y, renderWithA11y, assertNoA11yViolations } from '@/test-utils/a11y';
import MilestonesList from '@/components/MilestonesList';
import ContractSummary from '@/components/ContractSummary';
import ReputationProfile from '@/components/ReputationProfile';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ToastProvider, useToast } from '@/components/toast/toast-provider';

describe('a11y: MilestonesList', () => {
  it('empty list has no violations', async () => {
    await testA11y(<MilestonesList milestones={[]} />);
  });

  it('single milestone has no violations', async () => {
    await testA11y(
      <MilestonesList
        milestones={[
          { id: '1', title: 'Research phase', status: 'Pending', payout: 500, currency: 'USD', dueDate: 'May 10, 2026' },
        ]}
      />
    );
  });

  it('multiple milestones with all status types has no violations', async () => {
    await testA11y(
      <MilestonesList
        milestones={[
          { id: '1', title: 'Research phase', status: 'Pending', payout: 500, currency: 'USD', dueDate: 'May 10, 2026' },
          { id: '2', title: 'Development phase', status: 'Completed', payout: 1500, currency: 'USD', dueDate: 'Jun 1, 2026' },
          { id: '3', title: 'Deployment', status: 'Paid', payout: 2000, currency: 'USD', dueDate: 'Jul 15, 2026' },
          { id: '4', title: 'Legacy migration', status: 'Disputed', payout: 750, currency: 'USD' },
        ]}
      />
    );
  });

  it('milestone without dueDate has no violations', async () => {
    await testA11y(
      <MilestonesList
        milestones={[
          { id: '1', title: 'Ongoing work', status: 'Pending', payout: 300, currency: 'USD' },
        ]}
      />
    );
  });
});

describe('a11y: ContractSummary', () => {
  it('active contract with multiple parties has no violations', async () => {
    await testA11y(
      <ContractSummary
        contractName="Escrow Contract"
        parties={[
          { label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' },
          { label: 'Freelancer', address: 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210' },
        ]}
        totalValue={1200}
        currency="USD"
        status="Active"
        createdAt="May 1, 2026"
        milestoneCount={2}
      />
    );
  });

  it('disputed contract has no violations', async () => {
    await testA11y(
      <ContractSummary
        contractName="Escrow Contract"
        parties={[{ label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' }]}
        totalValue={5000}
        currency="USD"
        status="Disputed"
        createdAt="Apr 15, 2026"
        milestoneCount={5}
      />
    );
  });

  it('completed contract with milestoneCount of 1 has no violations', async () => {
    await testA11y(
      <ContractSummary
        contractName="Quick Project"
        parties={[
          { label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' },
          { label: 'Freelancer', address: 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210' },
        ]}
        totalValue={800}
        currency="USD"
        status="Completed"
        createdAt="Mar 1, 2026"
        milestoneCount={1}
      />
    );
  });
});

describe('a11y: ReputationProfile', () => {
  it('no reputation state has no violations', async () => {
    await testA11y(<ReputationProfile name="Guest User" history={[]} />);
  });

  it('full reputation with history has no violations', async () => {
    await testA11y(
      <ReputationProfile
        name="Verified User"
        score={88}
        level="Trusted Contributor"
        history={[
          { id: '1', type: 'Verification', summary: 'Completed identity verification', date: '2026-04-24' },
          { id: '2', type: 'On-chain review', summary: 'Received positive trust signal', date: '2026-04-23' },
          { id: '3', type: 'Referral', summary: 'Referred two new users', date: '2026-04-20' },
        ]}
      />
    );
  });

  it('partial reputation (score without history) has no violations', async () => {
    await testA11y(
      <ReputationProfile name="Partial User" score={42} level="Active Member" history={[]} />
    );
  });

  it('null score is handled gracefully with no violations', async () => {
    await testA11y(
      <ReputationProfile name="Legacy User" score={null} history={[]} />
    );
  });
});

describe('a11y: EmptyState', () => {
  it('basic text-only state has no violations', async () => {
    await testA11y(
      <EmptyState
        title="No items found"
        description="There are no items to display at this time."
      />
    );
  });

  it('with illustration variant has no violations', async () => {
    await testA11y(
      <EmptyState
        illustration="contracts"
        title="No contracts found"
        description="Start by creating your first contract."
      />
    );
  });

  it('with primary and secondary actions has no violations', async () => {
    await testA11y(
      <EmptyState
        illustration="milestones"
        title="No milestones tracked"
        description="Track delivery and escrow release points by adding milestones."
        actionLabel="Add Milestone"
        onAction={jest.fn()}
        secondaryActionLabel="View Contracts"
        onSecondaryAction={jest.fn()}
      />
    );
  });

  it('reputation illustration variant has no violations', async () => {
    await testA11y(
      <EmptyState
        illustration="reputation"
        title="No reputation yet"
        description="Complete contracts to build reputation."
        actionLabel="View Contracts"
        onAction={jest.fn()}
      />
    );
  });
});

/**
 * a11y/theming-27: dark-theme contrast audit.
 *
 * The suites below render StatusBadge and the toast panels with
 * document.documentElement set to [data-theme='dark'] (mirroring what
 * src/lib/preferences.tsx does at runtime), alongside light-mode coverage,
 * to confirm no axe violations in either theme.
 *
 * Note: jest-axe's color-contrast rule does not reliably evaluate colors
 * resolved through compiled Tailwind classes under jsdom, since jsdom does
 * not run a layout/paint engine. These tests verify structural a11y
 * (roles, labels, live regions) via axe in both themes, while the actual
 * WCAG AA contrast ratios for the colors involved are computed and
 * recorded in docs/components/Accessibility.md. The extra assertions in
 * each suite below (checking for the absence of the old fixed slate/pastel
 * classes) act as a regression guard for the contrast fix itself, since
 * axe alone won't catch a reverted color.
 */
function setTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
}

function ToastTrigger() {
  const { showError, showSuccess } = useToast();
  return (
    <div>
      <button
        onClick={() =>
          showSuccess({
            title: 'Milestone released',
            description: 'Funds are on the way to the freelancer wallet.',
          })
        }
        type="button"
      >
        Trigger success
      </button>
      <button
        onClick={() =>
          showError({
            title: 'Wallet not connected',
            description: 'Connect a wallet before approving this release.',
          })
        }
        type="button"
      >
        Trigger error
      </button>
    </div>
  );
}

describe('a11y: StatusBadge dark theme', () => {
  afterEach(() => {
    setTheme('light');
  });

  it('Active status has no violations in light mode', async () => {
    setTheme('light');
    await testA11y(<StatusBadge status="Active" />);
  });

  it('Active status has no violations in dark mode', async () => {
    setTheme('dark');
    await testA11y(<StatusBadge status="Active" />);
  });

  it('Completed status has no violations in dark mode', async () => {
    setTheme('dark');
    await testA11y(<StatusBadge status="Completed" />);
  });

  it('Disputed status has no violations in dark mode', async () => {
    setTheme('dark');
    await testA11y(<StatusBadge status="Disputed" />);
  });

  it('Pending status has no violations in dark mode', async () => {
    setTheme('dark');
    await testA11y(<StatusBadge status="Pending" />);
  });

  it('Paid status has no violations in dark mode', async () => {
    setTheme('dark');
    await testA11y(<StatusBadge status="Paid" />);
  });

  it('uses themed status tokens instead of fixed Tailwind pastel classes', () => {
    setTheme('dark');
    renderWithA11y(<StatusBadge status="Disputed" />);
    const badge = screen.getByRole('status', { name: 'Status: Disputed' });
    expect(badge.className).toMatch(/--status-error-(bg|foreground)/);
    expect(badge.className).not.toMatch(/bg-rose-100/);
  });
});

describe('a11y: toast panels dark theme', () => {
  afterEach(() => {
    setTheme('light');
  });

  it('success toast has no violations in light mode', async () => {
    setTheme('light');
    const view = renderWithA11y(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));
    await assertNoA11yViolations(view.container);
  });

  it('success toast has no violations in dark mode', async () => {
    setTheme('dark');
    const view = renderWithA11y(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));
    await assertNoA11yViolations(view.container);
  });

  it('error toast has no violations in dark mode', async () => {
    setTheme('dark');
    const view = renderWithA11y(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /trigger error/i }));
    await assertNoA11yViolations(view.container);
  });

  it('toast description uses the themed muted-foreground token, not a fixed slate class', () => {
    setTheme('dark');
    renderWithA11y(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));
    const description = screen.getByText('Funds are on the way to the freelancer wallet.');
    expect(description.className).not.toMatch(/text-slate-\d+/);
    expect(description.className).toContain('text-[var(--muted-foreground)]');
  });

  it('dismiss button uses themed tokens, not fixed slate classes', () => {
    setTheme('dark');
    renderWithA11y(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));
    const dismissButton = screen.getByRole('button', { name: /dismiss success notification/i });
    expect(dismissButton.className).not.toMatch(/slate-(100|500|900)/);
  });
});