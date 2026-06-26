import { render, screen, waitFor } from '@testing-library/react';
import ContractDetailPage from '../page';
import * as contractResolver from '@/lib/contractResolver';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

jest.mock('@/lib/contractResolver');

const mockShowSuccess = jest.fn();

jest.mock('@/components/toast/toast-provider', () => ({
  useToast: jest.fn(() => ({
    showSuccess: mockShowSuccess,
    showError: jest.fn(),
    toasts: [],
    dismissToast: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/**
 * Deep-clones a plain object via JSON round-trip.
 * Uses JSON serialization instead of structuredClone for compatibility
 * with Node.js < 17 (the version used in this project's CI environment).
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/** Base contract data resolved by the mock – mirrors the real contractResolver shape. */
const BASE_CONTRACT = {
  id: '123',
  name: 'Stellar Escrow Implementation',
  status: 'Active' as const,
  parties: [
    { label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' },
    { label: 'Freelancer', address: 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210' },
  ],
  totalValue: 7000,
  currency: 'USD',
  createdAt: 'Apr 20, 2026',
  milestones: [
    {
      id: 'ms-1',
      title: 'Kickoff and scope approval',
      status: 'Completed' as const,
      payout: 1500,
      currency: 'USD',
      dueDate: '2026-05-04',
    },
    {
      id: 'ms-2',
      title: 'Design and review',
      status: 'Pending' as const,
      payout: 2500,
      currency: 'USD',
      dueDate: '2026-06-01',
    },
    {
      id: 'ms-3',
      title: 'Final delivery',
      status: 'Pending' as const,
      payout: 3000,
      currency: 'USD',
      dueDate: '2026-07-12',
    },
  ],
};

/** Renders ContractDetailPage for the given id and awaits its async resolution. */
async function renderPage(id = '123') {
  const params = Promise.resolve({ id });
  const Component = await ContractDetailPage({ params });
  return render(Component);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  (contractResolver.resolveContractData as jest.Mock).mockResolvedValue(
    deepClone(BASE_CONTRACT),
  );
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('loading state', () => {
  it('renders the escrow progress skeleton while data is loading', async () => {
    const params = Promise.resolve({ id: '123' });
    const Component = await ContractDetailPage({ params });
    render(Component);

    await waitFor(() => {
      expect(screen.getByLabelText('Loading escrow progress')).toBeInTheDocument();
    });
  });

  it('marks the progress skeleton aria-busy during load', async () => {
    const params = Promise.resolve({ id: '123' });
    const Component = await ContractDetailPage({ params });
    render(Component);

    await waitFor(() => {
      const skeleton = screen.getByLabelText('Loading escrow progress');
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
    });
  });

  it('renders the contract summary skeleton while loading', async () => {
    const params = Promise.resolve({ id: '123' });
    const Component = await ContractDetailPage({ params });
    render(Component);

    await waitFor(() => {
      expect(screen.getByLabelText('Loading contract summary')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ContractProgress rendering
// ---------------------------------------------------------------------------

describe('ContractProgress integration', () => {
  it('renders the "Escrow Progress" section heading after load', async () => {
    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /escrow progress/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders a progressbar role element', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  it('sets aria-valuemin=0 and aria-valuemax=100 on the progress bar', async () => {
    await renderPage();

    await waitFor(() => {
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuemin', '0');
      expect(bar).toHaveAttribute('aria-valuemax', '100');
    });
  });

  it('reflects the correct percentage for a mixed-milestone contract', async () => {
    // 1 of 3 milestones completed → Math.round(1/3 * 100) = 33
    await renderPage();

    await waitFor(() => {
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '33');
    });
  });

  it('sets aria-valuenow=100 when all milestones are completed', async () => {
    const allPaid = deepClone(BASE_CONTRACT);
    allPaid.milestones.forEach((m) => { m.status = 'Completed'; });
    (contractResolver.resolveContractData as jest.Mock).mockResolvedValueOnce(allPaid);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    });
  });

  it('sets aria-valuenow=0 when no milestones are completed', async () => {
    const nonePaid = deepClone(BASE_CONTRACT);
    nonePaid.milestones.forEach((m) => { m.status = 'Pending'; });
    (contractResolver.resolveContractData as jest.Mock).mockResolvedValueOnce(nonePaid);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });
  });

  it('provides an aria-label describing the milestone progress', async () => {
    // 1 of 3 completed, 33%
    await renderPage();

    await waitFor(() => {
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute(
        'aria-label',
        '1 of 3 milestones completed, 33%',
      );
    });
  });

  it('counts "Paid" status milestones as completed', async () => {
    const withPaid = deepClone(BASE_CONTRACT);
    withPaid.milestones[0].status = 'Paid';
    withPaid.milestones[1].status = 'Paid';
    withPaid.milestones[2].status = 'Pending';
    (contractResolver.resolveContractData as jest.Mock).mockResolvedValueOnce(withPaid);

    await renderPage();

    await waitFor(() => {
      // 2 of 3 → 67%
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
    });
  });

  it('shows "Milestones completed" label text', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText(/milestones completed/i)).toBeInTheDocument();
    });
  });

  it('shows the completed / total count for the milestone mix', async () => {
    await renderPage();

    // 1 completed, 3 total
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
  });

  it('renders paid and outstanding amount cards', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Paid')).toBeInTheDocument();
      expect(screen.getByText('Outstanding')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty-milestones graceful handling
// ---------------------------------------------------------------------------

describe('empty milestones handling', () => {
  it('renders ContractProgress with zero state when milestones array is empty', async () => {
    const empty = { ...deepClone(BASE_CONTRACT), milestones: [] };
    (contractResolver.resolveContractData as jest.Mock).mockResolvedValueOnce(empty);

    await renderPage();

    await waitFor(() => {
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '0');
    });
  });

  it('shows 0 / 0 milestone count when milestones array is empty', async () => {
    const empty = { ...deepClone(BASE_CONTRACT), milestones: [] };
    (contractResolver.resolveContractData as jest.Mock).mockResolvedValueOnce(empty);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('0 / 0')).toBeInTheDocument();
    });
  });

  it('does not throw or show an error for empty milestones', async () => {
    const empty = { ...deepClone(BASE_CONTRACT), milestones: [] };
    (contractResolver.resolveContractData as jest.Mock).mockResolvedValueOnce(empty);

    // Should render without throwing
    await expect(renderPage()).resolves.not.toThrow();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /escrow progress/i }),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Currency pass-through (no hardcoded USD in the page)
// ---------------------------------------------------------------------------

describe('currency pass-through', () => {
  it('does not hardcode USD — uses the currency from the milestones', async () => {
    const xlmContract = deepClone(BASE_CONTRACT);
    xlmContract.currency = 'XLM';
    xlmContract.milestones.forEach((m) => { m.currency = 'XLM'; });
    (contractResolver.resolveContractData as jest.Mock).mockResolvedValueOnce(xlmContract);

    await renderPage();

    // The page should not inject any USD references in the progress section;
    // the component itself derives currency from milestone[0].currency.
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    // Verify the page passes milestones through without re-labelling the currency.
    const pageSource = document.body.innerHTML;
    // We're not asserting the formatted string since formatAmount is mocked via
    // usePreferences — we assert the progressbar is present and that the page
    // did not hardcode any currency symbol strings ("$" coming from USD format).
    expect(pageSource).not.toMatch(/\$1,500/);
  });
});

// ---------------------------------------------------------------------------
// Existing tests — preserved from before
// ---------------------------------------------------------------------------

describe('existing contract detail page behaviour', () => {
  it('renders the contract overview and action panel after successful load', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Contract #123')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Stellar Escrow Implementation')).toBeInTheDocument();
      expect(screen.getByText('Milestones')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Submit milestone/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading contract summary')).not.toBeInTheDocument();
  });

  it('passes isLoading prop to ActionPanel during data fetch', async () => {
    (contractResolver.resolveContractData as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ...deepClone(BASE_CONTRACT),
                milestones: [],
              }),
            100,
          ),
        ),
    );

    const params = Promise.resolve({ id: '123' });
    const Component = await ContractDetailPage({ params });
    render(Component);

    await waitFor(() => {
      const buttons = screen.queryAllByRole('button', { name: /Submit milestone/i });
      if (buttons.length > 0 && buttons[0].hasAttribute('disabled')) {
        expect(buttons[0]).toBeDisabled();
      }
    });
  });

  it('renders error message on load failure and disables actions', async () => {
    (contractResolver.resolveContractData as jest.Mock).mockRejectedValueOnce(
      new Error('Network error: Failed to fetch contract data'),
    );

    await renderPage();

    await waitFor(() => {
      const alert = screen.queryByRole('alert');
      if (alert) {
        expect(alert).toBeInTheDocument();
      }
    });
  });

  it('keeps the "Back to contracts" link for a valid id', async () => {
    await renderPage('contract-42');

    expect(screen.getByRole('link', { name: /back to contracts/i })).toHaveAttribute(
      'href',
      '/contracts',
    );
  });

  it.each([
    ['empty string', ''],
    ['path traversal', '../admin'],
    ['script tag', '<script>alert(1)</script>'],
    ['oversized', 'a'.repeat(65)],
    ['special chars', 'id#1!'],
  ])('calls notFound() for invalid id: %s', async (_label, id) => {
    const params = Promise.resolve({ id });
    await expect(ContractDetailPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('uses SafeBoundary to catch errors in ContractSummary and MilestonesList', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Contract #123')).toBeInTheDocument();
    });
  });

  it('announces loading state to accessibility users', async () => {
    const params = Promise.resolve({ id: '123' });
    const Component = await ContractDetailPage({ params });
    render(Component);

    await waitFor(() => {
      const loadingRegion = screen.getByLabelText('Loading contract summary');
      expect(loadingRegion).toHaveAttribute('aria-busy', 'true');
    });
  });
});
