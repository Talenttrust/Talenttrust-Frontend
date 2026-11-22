import { createRef } from 'react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { expectNoA11yViolations } from './a11y';
import { escrow } from './fixtures';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import Home from '@/app/page';
import ContractsPage from '@/app/contracts/page';
import ReputationPage from '@/app/reputation/page';
import DocsPage from '@/app/docs/page';
import NotFound from '@/app/not-found';
import StatementPage from '@/app/contracts/[id]/statement/page';
import { DisputeDialog } from '@/components/disputes/DisputeDialog';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { NotificationBell } from '@/components/NotificationBell';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/contracts',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: vi.fn() };
});

vi.mock('@/lib/stellar/freighter', () => ({
  getAddress: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/stellar/events', () => ({
  fetchRecentEvents: vi.fn().mockResolvedValue([]),
  describeEvent: vi.fn(),
}));

const apiMock = vi.mocked(api);

function ConfirmHarness() {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() => void confirm({ title: 'Confirm action', description: 'This action cannot be undone.' })}
    >
      Open confirmation
    </button>
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({ data: [] });
  localStorage.clear();
  navigation.push.mockClear();
  navigation.replace.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('route and dialog accessibility', () => {
  it('audits the landing page', async () => {
    await expectNoA11yViolations(<Home />);
  });

  it('audits the empty contracts dashboard', async () => {
    await expectNoA11yViolations(<ContractsPage />, {
      prepare: () => screen.findByText(/no escrows yet/i),
    });
  });

  it('audits the loaded contracts dashboard', async () => {
    apiMock.mockResolvedValue({ data: [escrow(7, { title: 'Website redesign' })] });
    await expectNoA11yViolations(<ContractsPage />, {
      prepare: () => screen.findByRole('heading', { name: /website redesign/i }),
    });
  });

  it('audits the contracts dashboard error state', async () => {
    apiMock.mockRejectedValue(new Error('API unavailable'));
    await expectNoA11yViolations(<ContractsPage />, {
      prepare: () => screen.findByRole('alert'),
    });
  });

  it('audits the reputation page', async () => {
    await expectNoA11yViolations(<ReputationPage />);
  });

  it('audits the documentation page', async () => {
    await expectNoA11yViolations(<DocsPage />);
  });

  it('audits an escrow statement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: escrow(7, { title: 'Website redesign' }) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const statement = await StatementPage({ params: Promise.resolve({ id: '7' }) });
    await expectNoA11yViolations(statement);
  });

  it('audits the not-found page', async () => {
    await expectNoA11yViolations(<NotFound />);
  });

  it('audits the open dispute dialog', async () => {
    await expectNoA11yViolations(
      <DisputeDialog
        contract={escrow(7)}
        triggerRef={createRef<HTMLButtonElement>()}
        onClose={() => {}}
        onSuccess={async () => {}}
      />,
    );
  });

  it('audits the open confirmation dialog', async () => {
    await expectNoA11yViolations(<ConfirmHarness />, {
      prepare: () => {
        fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
      },
    });
  });

  it('audits the open command palette', async () => {
    await expectNoA11yViolations(<CommandPalette />, {
      prepare: () => {
        fireEvent.click(screen.getByRole('button', { name: /search and command palette/i }));
      },
    });
  });

  it('audits the open notification panel', async () => {
    await expectNoA11yViolations(<NotificationBell />, {
      prepare: () => {
        fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
      },
    });
  });
});
