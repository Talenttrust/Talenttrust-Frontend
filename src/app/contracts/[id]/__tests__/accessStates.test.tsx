/**
 * Route-level access and recovery states for the contract detail route.
 *
 * The existing page.test.tsx suite pins the demo contract as readable by any
 * identity (including no wallet) — that is the public-resource default from
 * contractAccess.ts, and it must not regress. This suite pins the other half
 * of the issue: what each non-granted state renders, and that a route which
 * cannot be read never fetches.
 *
 * The resolver is auto-mocked here too, but `contractExists` /
 * `permittedAddressesFor` are restored to their real implementations with
 * `jest.requireActual` — they are the seam's honest answers, and mocking them
 * away would make these tests tautologies.
 *
 * The three id classes from the issue, and where each is handled:
 *   - malformed (`../x`, too long)  → `notFound()` before any decision
 *   - well-formed, unknown          → access state 'not-found', no fetch
 *   - well-formed, restricted       → 'unauthorized' or 'granted' by wallet
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContractDetailPage from '../page';
import * as contractResolver from '@/lib/contractResolver';
import { notFound } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { ToastProvider } from '@/components/toast/toast-provider';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

jest.mock('@/lib/contractResolver', () => ({
  ...jest.requireActual('@/lib/contractResolver'),
  resolveContractData: jest.fn(),
}));

jest.mock('@/lib/repository', () => ({
  upsertContract: jest.fn(),
  listMilestonesByContract: jest.fn(() => []),
  getContractVersion: jest.fn(() => 0),
  updateMilestone: jest.fn(() => true),
}));

jest.mock('@/contexts/WalletContext', () => ({
  useWallet: jest.fn(),
}));

const mockedResolveContractData = jest.mocked(contractResolver.resolveContractData);
const mockedNotFound = notFound as jest.Mock;
const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

const DEMO_CONTRACT: contractResolver.ContractData = {
  id: 'restricted-demo',
  name: 'Stellar Escrow Implementation',
  status: 'Active',
  parties: [],
  totalValue: 1,
  currency: 'USD',
  createdAt: 'x',
  updatedAt: 'x',
  milestones: [],
};

function wallet(address: string | null) {
  mockedUseWallet.mockReturnValue({
    address,
    isConnecting: false,
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
  });
}

async function renderPage(id: string) {
  let result: ReturnType<typeof render>;
  // `use(params)` suspends the subtree until the promise resolves, so the
  // render must be awaited inside act — the same pattern page.test.tsx uses.
  await act(async () => {
    result = render(
      <ToastProvider>
        <ContractDetailPage params={Promise.resolve({ id })} />
      </ToastProvider>,
    );
  });
  return result!;
}

beforeEach(() => {
  jest.clearAllMocks();
  // The route caches resolved contracts in localStorage and serves the cache
  // when a fresh load fails — correct in production, poison between tests:
  // a previous test's cached '123' would mask the server-failure state.
  window.localStorage.clear();
  wallet(null);
});

describe('ContractDetailPage access states', () => {
  it('calls notFound() for a malformed id before any access decision', async () => {
    await expect(renderPage('../escape')).rejects.toThrow('NEXT_NOT_FOUND');

    // Route-param validation is the first gate: no decision, no fetch, no
    // render for an id that cannot be safe.
    expect(mockedResolveContractData).not.toHaveBeenCalled();
    expect(mockedNotFound).toHaveBeenCalled();
  });

  it('renders the not-found state for a well-formed unknown id without fetching it', async () => {
    await renderPage('unknown-id-42');

    const state = await screen.findByTestId('contract-access-state');
    expect(state).toHaveTextContent(/contract not found/i);
    // The whole point of the separation: no fetch fires for a resource that
    // does not exist, so the route cannot be probed for existence.
    expect(mockedResolveContractData).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /release funds/i })).not.toBeInTheDocument();
  });

  it('offers recovery links on the not-found state', async () => {
    await renderPage('unknown-id-42');

    const state = await screen.findByTestId('contract-access-state');
    expect(state).toHaveTextContent(/back to contracts/i);
    expect(state).toHaveTextContent(/track milestones/i);
  });

  it('renders the unauthorized state for a restricted contract with the wrong wallet', async () => {
    wallet('GWALLET0000000000000000000000000000000000000000000001');
    await renderPage('restricted-demo');

    const state = await screen.findByTestId('contract-access-state');
    // Wording must not confirm or deny that the id exists.
    expect(state).toHaveTextContent(/you do not have access/i);
    expect(state).toHaveTextContent(/restricted to the wallets named on it/i);
    expect(mockedResolveContractData).not.toHaveBeenCalled();
  });

  it('keeps the manage-wallet recovery link on the unauthorized state', async () => {
    wallet('GWALLET0000000000000000000000000000000000000000000001');
    await renderPage('restricted-demo');

    const state = await screen.findByTestId('contract-access-state');
    expect(state).toHaveTextContent(/manage wallet/i);
    expect(state).toHaveTextContent(/back to contracts/i);
  });

  it('grants a restricted contract to a permitted wallet and loads it', async () => {
    wallet('gademoclient0000000000000000000000000000000001'); // case-insensitive match
    mockedResolveContractData.mockResolvedValue({
      ...DEMO_CONTRACT,
      id: 'restricted-demo',
    });

    await renderPage('restricted-demo');

    // The access panel disappears once granted; the contract content renders.
    await waitFor(() => {
      expect(screen.queryByTestId('contract-access-state')).not.toBeInTheDocument();
    });
    expect(mockedResolveContractData).toHaveBeenCalledWith('restricted-demo');
  });

  it('loads a public contract even with no wallet — undecided is not denied', async () => {
    mockedResolveContractData.mockResolvedValue({
      ...DEMO_CONTRACT,
      id: '123',
    });

    await renderPage('123');

    await waitFor(() => {
      expect(mockedResolveContractData).toHaveBeenCalledWith('123');
    });
    expect(screen.queryByTestId('contract-access-state')).not.toBeInTheDocument();
  });

  it('renders a server-failure retry state with a working Try again button', async () => {
    wallet('0x123');
    // Reset first: an earlier test's persistent resolved mock must not leak
    // in, or a second effect run would silently succeed and hide the panel.
    mockedResolveContractData.mockReset();
    mockedResolveContractData.mockRejectedValue(new Error('boom'));

    await renderPage('123');

    const retry = await screen.findByRole('button', { name: /try again/i });
    // getAll: ActionPanel may render its own alert region alongside ours.
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => el.textContent?.match(/could not load this contract/i))).toBe(true);

    mockedResolveContractData.mockResolvedValueOnce({
      ...DEMO_CONTRACT,
      id: '123',
    });
    await userEvent.setup().click(retry);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    });
    expect(mockedResolveContractData).toHaveBeenCalledTimes(2);
  });
});
