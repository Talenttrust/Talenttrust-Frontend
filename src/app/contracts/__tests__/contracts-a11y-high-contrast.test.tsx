/**
 * contracts-a11y-high-contrast.test.tsx
 *
 * Structural coverage for forced-colors / high-contrast support on the
 * contracts view (issue: "Add high-contrast mode support to contracts").
 * jsdom does not evaluate `@media (forced-colors: active)`, so — mirroring
 * the existing wallet/reputation high-contrast tests — these assert the
 * presence of the `data-*` hooks the CSS in `globals.css` targets, plus an
 * axe audit of the rendered structure.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ContractsList from '@/components/contracts/ContractsList';
import ContractsPage from '../page';
import * as repository from '@/lib/repository';
import { assertNoA11yViolations } from '@/test-utils/a11y';
import type { Contract } from '@/types/domain';

jest.mock('@/lib/exportContracts', () => ({
  downloadContractsCsv: jest.fn(),
  downloadContractsJson: jest.fn(),
}));

const CONTRACTS: Contract[] = [
  {
    id: 'contract-1',
    contractName: 'Website redesign',
    parties: [
      { label: 'Client', address: 'GCLIENT' },
      { label: 'Freelancer', address: 'GFREELANCER' },
    ],
    totalValue: 2500,
    currency: 'USD',
    status: 'Active',
    createdAt: '2026-07-20',
    milestoneCount: 3,
  },
];

describe('a11y: high-contrast — Contracts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('contracts list has data-contracts-list attribute for forced-colors targeting', () => {
    const { container } = render(<ContractsList contracts={CONTRACTS} />);
    expect(container.querySelector('[data-contracts-list]')).toBeInTheDocument();
  });

  it('list items remain within the tagged list container', () => {
    const { container } = render(<ContractsList contracts={CONTRACTS} />);
    const items = container.querySelectorAll('[data-contracts-list] li');
    expect(items).toHaveLength(1);
  });

  it('has no axe violations when rendered with contracts', async () => {
    const { container } = render(<ContractsList contracts={CONTRACTS} />);
    await assertNoA11yViolations(container);
  });

  it('contracts page root has data-contracts-page attribute for forced-colors targeting', () => {
    jest.spyOn(repository, 'listContracts').mockReturnValue(CONTRACTS);
    const { container } = render(<ContractsPage />);
    expect(container.querySelector('[data-contracts-page]')).toBeInTheDocument();
  });

  it('density toggle stays keyboard-focusable (forced-colors focus restoration target)', () => {
    jest.spyOn(repository, 'listContracts').mockReturnValue(CONTRACTS);
    render(<ContractsPage />);
    const toggle = screen.getByRole('button', { name: /switch to compact density/i });
    toggle.focus();
    expect(toggle).toHaveFocus();
  });
});
