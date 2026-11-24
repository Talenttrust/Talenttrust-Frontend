import { act, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import StatusClient, {
  AUTO_REFRESH_MS,
  HISTORY_LIMIT,
  HISTORY_STORAGE_KEY,
  appendHistory,
  emptyHistory,
  loadHistory,
} from './StatusClient';
import {
  checkApi,
  checkChainConfig,
  checkContract,
  checkRpc,
  type StatusResult,
} from '@/lib/status';

vi.mock('@/lib/status', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/status')>();
  return {
    ...actual,
    checkApi: vi.fn(),
    checkChainConfig: vi.fn(),
    checkRpc: vi.fn(),
    checkContract: vi.fn(),
  };
});

const api = vi.mocked(checkApi);
const chain = vi.mocked(checkChainConfig);
const rpc = vi.mocked(checkRpc);
const contract = vi.mocked(checkContract);

const ok = (detail: string): StatusResult => ({ state: 'operational', latencyMs: 12, detail });
const down = (detail: string): StatusResult => ({ state: 'down', latencyMs: 0, detail });
const degraded = (detail: string): StatusResult => ({ state: 'degraded', latencyMs: 2500, detail });

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  api.mockResolvedValue(ok('API v1.2.3 responded in 12ms'));
  chain.mockResolvedValue({
    state: 'operational',
    latencyMs: 9,
    detail: 'Network: testnet, Contract: CCZMIVUB…',
    rpcUrl: 'https://rpc.example.com',
  });
  rpc.mockResolvedValue(ok('Ledger #12345, protocol v21'));
  contract.mockResolvedValue(ok('Contract CCZMIVUB… reachable at ledger #12345'));
});

describe('StatusClient', () => {
  it('renders an all-operational banner and every component row', async () => {
    render(<StatusClient />);

    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent('All systems operational'),
    );
    expect(screen.getByText('REST API (/health)')).toBeInTheDocument();
    expect(screen.getByText('Chain Config (/api/v1/chain)')).toBeInTheDocument();
    expect(screen.getByText('Soroban RPC')).toBeInTheDocument();
    expect(screen.getByText('Escrow Contract')).toBeInTheDocument();
    expect(screen.getAllByText('Operational').length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText('12ms').length).toBeGreaterThan(0);
    expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('https://rpc.example.com', expect.any(AbortSignal));
    expect(contract).toHaveBeenCalledWith('https://rpc.example.com', expect.any(AbortSignal));
  });

  it('marks the results region as a polite live region', async () => {
    render(<StatusClient />);
    const region = await screen.findByTestId('status-checks');
    expect(region).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(region).toHaveAttribute('aria-busy', 'false'));
  });

  it('shows a partial outage when the API is down and conveys state as text', async () => {
    api.mockResolvedValue(down('Network error: Failed to fetch'));
    render(<StatusClient />);

    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent(
        'Partial outage — one or more systems are down',
      ),
    );
    expect(screen.getAllByText('Down').length).toBeGreaterThan(0);
    expect(screen.getByTestId('status-announcer')).toHaveTextContent(/Partial outage/);
  });

  it('shows the malformed-JSON failure detail when a checker returns one', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(down('Malformed JSON from /health'));
    render(<StatusClient />);

    const toggle = await screen.findByRole('button', { name: 'Show details for REST API (/health)' });
    await user.click(toggle);
    expect(screen.getByText('Malformed JSON from /health')).toBeVisible();
  });

  it('warns and announces degraded when the backend config mismatches', async () => {
    chain.mockResolvedValue({
      state: 'degraded',
      latencyMs: 15,
      detail: 'Contract ID mismatch',
      rpcUrl: 'https://rpc.example.com',
      mismatch: 'Contract ID mismatch — backend: OTHER, frontend: CCZMIVUB',
    });
    render(<StatusClient />);

    const alert = await screen.findByTestId('mismatch-alert');
    expect(alert).toHaveTextContent('Configuration mismatch:');
    expect(alert).toHaveTextContent('Contract ID mismatch');
    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent(
        'Partial outage — some systems degraded',
      ),
    );
    expect(screen.getAllByText('Degraded').length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to the configured RPC URL when chain config is unavailable', async () => {
    chain.mockResolvedValue(down('Network error: Failed to fetch'));
    render(<StatusClient />);

    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent(/Partial outage/),
    );
    expect(rpc).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//), expect.any(AbortSignal));
    expect(contract).toHaveBeenCalled();
  });

  it('supports keyboard-only operation of the details toggle and re-run button', async () => {
    const user = userEvent.setup();
    render(<StatusClient />);
    await screen.findByTestId('status-banner');
    await waitFor(() => expect(screen.getByTestId('status-checks')).toHaveAttribute('aria-busy', 'false'));

    const toggle = screen.getByRole('button', { name: 'Show details for REST API (/health)' });
    toggle.focus();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAccessibleName();

    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('API v1.2.3 responded in 12ms')).toBeVisible();

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    const rerun = screen.getByRole('button', { name: 'Re-run all status checks' });
    rerun.focus();
    expect(rerun).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(rerun).toBeEnabled());
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<StatusClient />);
    await screen.findByTestId('status-banner');
    await waitFor(() => expect(screen.getByTestId('status-checks')).toHaveAttribute('aria-busy', 'false'));
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('auto-refresh visibility, offline handling, and unmount abort', () => {
    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: state,
      });
    };

    const setNavigatorOnline = (online: boolean) => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: online,
      });
    };

    afterEach(() => {
      vi.useRealTimers();
      setVisibility('visible');
      setNavigatorOnline(true);
    });

    it('skips scheduled refreshes while the tab is hidden and refreshes when visible after the interval', async () => {
      vi.useFakeTimers();
      setVisibility('visible');
      setNavigatorOnline(true);

      render(<StatusClient />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(api).toHaveBeenCalledTimes(1);

      // Hide the tab and advance past multiple refresh intervals.
      setVisibility('hidden');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await act(async () => {
        vi.advanceTimersByTime(90_000);
        await Promise.resolve();
      });
      expect(api).toHaveBeenCalledTimes(1);

      // Returning to visible after >= 30s triggers an immediate refresh.
      setVisibility('visible');
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(api).toHaveBeenCalledTimes(2);
    });

    it('shows an offline notice instead of checking and does not mark services down', async () => {
      vi.useFakeTimers();
      setVisibility('visible');
      setNavigatorOnline(true);

      render(<StatusClient />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(api).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('status-banner')).toHaveTextContent('All systems operational');

      // Go offline and advance past the refresh interval.
      setNavigatorOnline(false);
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      expect(screen.getByTestId('offline-notice')).toHaveTextContent(
        'You are offline - results may be outdated',
      );
      expect(screen.getByTestId('status-banner')).toHaveTextContent('All systems operational');

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });
      expect(api).toHaveBeenCalledTimes(1);

      // Coming back online hides the notice and refreshes stale results.
      setNavigatorOnline(true);
      await act(async () => {
        window.dispatchEvent(new Event('online'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.queryByTestId('offline-notice')).not.toBeInTheDocument();
      expect(api).toHaveBeenCalledTimes(2);
    });

    it('aborts in-flight checks on unmount', async () => {
      let capturedSignal: AbortSignal | undefined;
      api.mockImplementation((signal) => {
        capturedSignal = signal;
        return new Promise(() => {
          // Intentionally unresolved to keep the check in-flight.
        });
      });

      const { unmount } = render(<StatusClient />);
      await waitFor(() => expect(capturedSignal).toBeDefined());
      expect(capturedSignal?.aborted).toBe(false);

      unmount();
      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  it('records one history entry per check and persists it to sessionStorage', async () => {
    render(<StatusClient />);

    await waitFor(() =>
      expect(screen.getAllByRole('group', { name: /recent .* checks/i })).toHaveLength(4),
    );

    const stored = JSON.parse(sessionStorage.getItem(HISTORY_STORAGE_KEY) ?? '{}');
    for (const key of ['api', 'chain', 'rpc', 'contract']) {
      expect(stored[key]).toHaveLength(1);
      expect(stored[key][0].state).toBe('operational');
    }
  });

  it('keeps RPC and contract histories independent', async () => {
    rpc.mockResolvedValue(degraded('slow RPC'));
    contract.mockResolvedValue(down('contract missing'));
    render(<StatusClient />);

    await waitFor(() => expect(screen.getByTestId('status-banner')).toHaveTextContent(/Partial outage/));

    const stored = JSON.parse(sessionStorage.getItem(HISTORY_STORAGE_KEY) ?? '{}');
    expect(stored.rpc.map((entry: { state: string }) => entry.state)).toEqual(['degraded']);
    expect(stored.contract.map((entry: { state: string }) => entry.state)).toEqual(['down']);
    expect(stored.api.map((entry: { state: string }) => entry.state)).toEqual(['operational']);
    expect(stored.chain.map((entry: { state: string }) => entry.state)).toEqual(['operational']);
  });

  it('caps each history list at 20 entries', () => {
    let history = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      history = appendHistory(
        history,
        { api: ok('a'), chain: ok('c'), rpc: ok('r'), contract: ok('x') },
        at,
      );
    }

    expect(history.api).toHaveLength(HISTORY_LIMIT);
    expect(history.api[0].at).toBe(new Date(Date.UTC(2026, 0, 1, 0, 0, HISTORY_LIMIT + 4)).toISOString());
    expect(history.contract).toHaveLength(HISTORY_LIMIT);
  });

  it('ignores corrupted stored history and still renders', async () => {
    sessionStorage.setItem(HISTORY_STORAGE_KEY, '{not json');

    render(<StatusClient />);

    await waitFor(() =>
      expect(screen.getByTestId('status-banner')).toHaveTextContent('All systems operational'),
    );
    expect(screen.getAllByRole('group', { name: /recent .* checks/i })).toHaveLength(4);
  });

  it('filters unexpected stored history entries', () => {
    sessionStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify({
        api: [
          { state: 'weird', at: 'not-a-date' },
          { state: 'operational', at: '2026-01-01T00:00:00.000Z' },
          'nope',
        ],
        chain: 'nope',
      }),
    );

    const history = loadHistory();
    expect(history.api).toEqual([{ state: 'operational', at: '2026-01-01T00:00:00.000Z' }]);
    expect(history.chain).toEqual([]);
    expect(history.rpc).toEqual([]);
    expect(history.contract).toEqual([]);
  });

  it('renders when sessionStorage is unavailable', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    try {
      render(<StatusClient />);
      await waitFor(() =>
        expect(screen.getByTestId('status-banner')).toHaveTextContent('All systems operational'),
      );
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('does not add history entries on rerender', async () => {
    const { rerender } = render(<StatusClient />);
    await waitFor(() =>
      expect(screen.getAllByRole('group', { name: /recent .* checks/i })).toHaveLength(4),
    );

    rerender(<StatusClient />);
    await waitFor(() =>
      expect(screen.getAllByRole('group', { name: /recent .* checks/i })).toHaveLength(4),
    );

    const stored = JSON.parse(sessionStorage.getItem(HISTORY_STORAGE_KEY) ?? '{}');
    expect(stored.api).toHaveLength(1);
  });

  it('shows the status and timestamp in each recent-history list', async () => {
    render(<StatusClient />);

    const group = await screen.findByRole('group', { name: /recent REST API/i });
    expect(within(group).getByText('Operational')).toBeInTheDocument();
    const time = group.querySelector('time');
    expect(time?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(time?.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('auto-refreshes every 30 seconds', async () => {
    expect(AUTO_REFRESH_MS).toBe(30_000);
    vi.useFakeTimers();
    try {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      render(<StatusClient />);
      await act(async () => {});
      expect(api).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTO_REFRESH_MS);
      });
      expect(api).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
