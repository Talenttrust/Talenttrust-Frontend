/**
 * ReputationExportButton.test.tsx
 *
 * Tests for src/components/ReputationExportButton.tsx.
 * Covers: CSV activation, JSON activation, empty-view (disabled) behavior,
 * and accessibility of the export control.
 */

import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { testA11y, renderWithA11y } from '@/test-utils/a11y';
import ReputationExportButton from '../ReputationExportButton';
import type { ReputationEvent } from '@/components/ReputationProfile';

// Mock the export adapter so we assert the control wires up the right call
// without triggering an actual browser download.
jest.mock('@/lib/reputationExport', () => ({
  exportReputationHistory: jest.fn(),
}));

import { exportReputationHistory } from '@/lib/reputationExport';

const mockExport = exportReputationHistory as jest.MockedFunction<
  typeof exportReputationHistory
>;

const sampleEvents: ReputationEvent[] = [
  { id: 'rep-1', type: 'endorsement', summary: 'Great work', date: '2026-05-15', version: 1 },
  { id: 'rep-2', type: 'review', summary: 'On time', date: '2026-06-01', version: 2 },
];

afterEach(() => {
  jest.clearAllMocks();
});

describe('ReputationExportButton', () => {
  it('opens the menu and exports as CSV with the visible events', () => {
    renderWithA11y(<ReputationExportButton events={sampleEvents} />);

    fireEvent.click(screen.getByRole('button', { name: /export reputation history/i }));

    // Menu items fire on mousedown (before the toggle button's blur closes the menu).
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: /export as csv/i }));

    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockExport).toHaveBeenCalledWith(sampleEvents, 'csv', 'reputation-history');
  });

  it('exports as JSON when the JSON menu item is activated', () => {
    renderWithA11y(<ReputationExportButton events={sampleEvents} filename="my-rep" />);

    fireEvent.click(screen.getByRole('button', { name: /export reputation history/i }));
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: /export as json/i }));

    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockExport).toHaveBeenCalledWith(sampleEvents, 'json', 'my-rep');
  });

  it('is disabled and opens no menu when there are no events', () => {
    renderWithA11y(<ReputationExportButton events={[]} />);

    const toggle = screen.getByRole('button', { name: /export reputation history/i });
    expect(toggle).toBeDisabled();

    fireEvent.click(toggle);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('has no accessibility violations when closed', async () => {
    await testA11y(<ReputationExportButton events={sampleEvents} />);
  });

  it('has no accessibility violations when the menu is open', async () => {
    const { container } = renderWithA11y(<ReputationExportButton events={sampleEvents} />);
    fireEvent.click(screen.getByRole('button', { name: /export reputation history/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    const { assertNoA11yViolations } = await import('@/test-utils/a11y');
    await assertNoA11yViolations(container);
  });
});
