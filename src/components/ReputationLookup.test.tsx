/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom/vitest" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Keypair } from '@stellar/stellar-sdk';
import { ReputationLookup } from './ReputationLookup';
import { readOnChainReputation, type OnChainReputation } from '@/lib/stellar/reputation';
import { REPUTATION_HISTORY_KEY, saveReputationHistory } from '@/lib/reputationHistory';

const nav = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.searchParams,
}));

vi.mock('@/lib/stellar/reputation', () => ({
  readOnChainReputation: vi.fn(),
}));

const mockReadOnChain = vi.mocked(readOnChainReputation);
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const makeAddress = () => Keypair.random().publicKey();

const apiPayload = (address: string, overrides: Record<string, unknown> = {}) => ({
  address,
  completedContracts: 5,
  totalRating: 25,
  averageRating: 5,
  ...overrides,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function respondWith(body: unknown, status = 200): void {
  fetchMock.mockResolvedValue(jsonResponse(body, status));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function submit(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = screen.getByLabelText('Freelancer address');
  await user.clear(input);
  await user.type(input, value);
  await user.keyboard('{Enter}');
}

/** Submit again while a request is still in flight (the submit button is disabled). */
function submitAgain(value: string) {
  const input = screen.getByLabelText('Freelancer address');
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);
}

const lookUpButton = () => screen.getByRole('button', { name: /^look(ing)? up/i });

describe('ReputationLookup', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockReadOnChain.mockReset();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    nav.searchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('starts with an empty input and a useful placeholder', () => {
    render(<ReputationLookup />);

    const input = screen.getByLabelText('Freelancer address');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', expect.stringMatching(/stellar/i));
    expect(lookUpButton()).toBeInTheDocument();
  });

  it('renders both labelled result groups when on-chain and API succeed and match', async () => {
    const validAddress = makeAddress();
    respondWith(apiPayload(validAddress));
    mockReadOnChain.mockResolvedValue({ ...apiPayload(validAddress), address: validAddress });

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, validAddress);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Reputation results' })).toHaveAttribute('aria-live', 'polite'),
    );

    expect(screen.getByRole('heading', { name: 'On-chain (verified)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TalentTrust API (demo)' })).toBeInTheDocument();
    expect(screen.getAllByText('Completed contracts')).toHaveLength(2);
    expect(screen.getAllByText('5.00 / 5')).toHaveLength(2);
    expect(screen.queryByText(/values differ/i)).not.toBeInTheDocument();

    expect(mockReadOnChain).toHaveBeenCalledWith(validAddress);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/reputation/${encodeURIComponent(validAddress)}`),
      expect.anything(),
    );
    expect(screen.getByRole('link', { name: /stellar.expert/i })).toBeInTheDocument();
  });

  it('shows a non-blocking notice when both succeed but differ', async () => {
    const validAddress = makeAddress();
    respondWith({ ...apiPayload(validAddress), averageRating: 4 });
    mockReadOnChain.mockResolvedValue({ ...apiPayload(validAddress), address: validAddress, averageRating: 5 });

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, validAddress);

    await waitFor(() => screen.getByText(/values differ/i));
    await waitFor(() => screen.getByText(/demo mirror/i));
    expect(screen.getAllByText('4.00 / 5')).toHaveLength(1);
    expect(screen.getAllByText('5.00 / 5')).toHaveLength(1);
  });

  it('still shows the API result when on-chain read fails, with a retry control', async () => {
    const validAddress = makeAddress();
    respondWith(apiPayload(validAddress));
    mockReadOnChain.mockRejectedValueOnce(new Error('could not read contract'));

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, validAddress);

    await waitFor(() => screen.getByText(/could not read contract/i));
    expect(screen.getByRole('heading', { name: 'TalentTrust API (demo)' })).toBeInTheDocument();
    expect(screen.getByText('5.00 / 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry on-chain/i })).toBeInTheDocument();

    mockReadOnChain.mockResolvedValue({ ...apiPayload(validAddress), address: validAddress });
    await user.click(screen.getByRole('button', { name: /retry on-chain/i }));
    await waitFor(() => expect(mockReadOnChain).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/could not read contract/i)).not.toBeInTheDocument();
  });

  it('shows an API error and retry control for a network error', async () => {
    const validAddress = makeAddress();
    fetchMock.mockRejectedValue(new Error('network down'));
    mockReadOnChain.mockResolvedValue({ ...apiPayload(validAddress), address: validAddress });

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, validAddress);

    await waitFor(() => screen.getByText('network down'), { timeout: 10000 });
    expect(screen.getByRole('heading', { name: 'On-chain (verified)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry api/i })).toBeInTheDocument();

    respondWith(apiPayload(validAddress));
    await user.click(screen.getByRole('button', { name: /retry api/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(screen.queryByText(/network down/i)).not.toBeInTheDocument();
  });

  it('shows an API error and retry control for a non-2xx response', async () => {
    const validAddress = makeAddress();
    respondWith({}, 404);
    mockReadOnChain.mockResolvedValue({ ...apiPayload(validAddress), address: validAddress });

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, validAddress);

    await waitFor(() => screen.getByText('Request failed (404)'), { timeout: 10000 });
    expect(screen.getByRole('button', { name: /retry api/i })).toBeInTheDocument();

    respondWith(apiPayload(validAddress));
    await user.click(screen.getByRole('button', { name: /retry api/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Request failed \(404\)/i)).not.toBeInTheDocument();
  });

  it('shows errors from both sources when both fail', async () => {
    const validAddress = makeAddress();
    fetchMock.mockRejectedValue(new Error('network down'));
    mockReadOnChain.mockRejectedValue(new Error('chain down'));

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, validAddress);

    await waitFor(() => screen.getByText('network down'), { timeout: 10000 });
    await waitFor(() => screen.getByText('chain down'));
    expect(screen.getByRole('heading', { name: 'On-chain (verified)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TalentTrust API (demo)' })).toBeInTheDocument();
    expect(screen.queryByText(/values differ/i)).not.toBeInTheDocument();
  });

  it('uses the shared validation utility and shows its specific messages', async () => {
    const user = userEvent.setup();
    render(<ReputationLookup />);

    await submit(user, 'short');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Stellar addresses must be 56 characters long.'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockReadOnChain).not.toHaveBeenCalled();

    const validAddress = makeAddress();
    const mutated = `${validAddress.slice(0, -1)}${validAddress.endsWith('X') ? 'Y' : 'X'}`;
    await submit(user, mutated);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Address checksum is invalid. Check the address for typos.',
      ),
    );
    expect(screen.getByLabelText('Freelancer address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('normalizes pasted or submitted addresses', async () => {
    const validAddress = makeAddress();
    respondWith(apiPayload(validAddress));
    mockReadOnChain.mockResolvedValue({ ...apiPayload(validAddress), address: validAddress });

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, `  ${validAddress.toLowerCase()}  `);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(validAddress)),
        expect.anything(),
      ),
    );
    expect(screen.getByLabelText('Freelancer address')).toHaveValue(validAddress);
    expect(mockReadOnChain).toHaveBeenCalledWith(validAddress);
  });

  it('keeps the URL address parameter in sync with a successful lookup', async () => {
    const validAddress = makeAddress();
    respondWith(apiPayload(validAddress));
    mockReadOnChain.mockResolvedValue({ ...apiPayload(validAddress), address: validAddress });

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, validAddress);

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('address')).toBe(validAddress),
    );
  });

  it('initializes from a valid URL address', async () => {
    const validAddress = makeAddress();
    nav.searchParams = new URLSearchParams({ address: validAddress });
    respondWith(apiPayload(validAddress));
    mockReadOnChain.mockResolvedValue({ ...apiPayload(validAddress), address: validAddress });

    render(<ReputationLookup />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(validAddress)),
        expect.anything(),
      ),
    );
    expect(screen.getByLabelText('Freelancer address')).toHaveValue(validAddress);
  });

  it('keeps the empty default when the URL address is invalid', () => {
    nav.searchParams = new URLSearchParams({ address: 'not-an-address' });
    render(<ReputationLookup />);

    expect(screen.getByLabelText('Freelancer address')).toHaveValue('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores stale API responses from an earlier lookup', async () => {
    const first = makeAddress();
    const second = makeAddress();
    const pendingFirst = deferred<Response>();
    const pendingSecond = deferred<Response>();
    fetchMock.mockImplementation((url: string) =>
      url.includes(encodeURIComponent(first)) ? pendingFirst.promise : pendingSecond.promise,
    );
    mockReadOnChain.mockResolvedValue({
      address: second,
      completedContracts: 2,
      totalRating: 10,
      averageRating: 5,
    } satisfies OnChainReputation);

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, first);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    submitAgain(second);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    pendingSecond.resolve(
      jsonResponse(apiPayload(second, { completedContracts: 2, totalRating: 8, averageRating: 4 })),
    );
    await waitFor(() => expect(screen.getByText('4.00 / 5')).toBeInTheDocument());

    pendingFirst.resolve(
      jsonResponse(apiPayload(first, { completedContracts: 9, totalRating: 9, averageRating: 1 })),
    );

    await waitFor(() => expect(screen.getByText('4.00 / 5')).toBeInTheDocument());
    expect(screen.queryByText('1.00 / 5')).not.toBeInTheDocument();
  });

  it('ignores stale on-chain responses from an earlier lookup', async () => {
    const first = makeAddress();
    const second = makeAddress();
    const pendingFirst = deferred<OnChainReputation>();
    const pendingSecond = deferred<OnChainReputation>();
    mockReadOnChain.mockImplementation((value: string) =>
      value === first ? pendingFirst.promise : pendingSecond.promise,
    );
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        jsonResponse(
          url.includes(encodeURIComponent(first))
            ? apiPayload(first, { averageRating: 1 })
            : apiPayload(second, { averageRating: 4 }),
        ),
      ),
    );

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, first);
    await waitFor(() => expect(mockReadOnChain).toHaveBeenCalledTimes(1));
    submitAgain(second);
    await waitFor(() => expect(mockReadOnChain).toHaveBeenCalledTimes(2));

    pendingSecond.resolve({
      address: second,
      completedContracts: 2,
      totalRating: 8,
      averageRating: 4,
    });
    await waitFor(() => expect(screen.getAllByText('4.00 / 5')).toHaveLength(2));

    pendingFirst.resolve({
      address: first,
      completedContracts: 9,
      totalRating: 9,
      averageRating: 1,
    });

    await waitFor(() => expect(screen.getAllByText('4.00 / 5')).toHaveLength(2));
    expect(screen.queryByText('1.00 / 5')).not.toBeInTheDocument();
  });

  it('aborts the previous request when a new lookup starts and hides AbortError', async () => {
    const first = makeAddress();
    const second = makeAddress();
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>(() => {});
    });
    mockReadOnChain.mockResolvedValue({
      address: second,
      completedContracts: 1,
      totalRating: 5,
      averageRating: 5,
    });

    const user = userEvent.setup();
    render(<ReputationLookup />);
    await submit(user, first);
    await waitFor(() => expect(signals).toHaveLength(1));
    submitAgain(second);
    await waitFor(() => expect(signals).toHaveLength(2));

    await waitFor(() => expect(signals[0].aborted).toBe(true));
    expect(signals[1].aborted).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders recent-address chips that trigger the correct lookup', async () => {
    const recent = makeAddress();
    saveReputationHistory([recent]);
    respondWith(apiPayload(recent));
    mockReadOnChain.mockResolvedValue({ ...apiPayload(recent), address: recent });

    const user = userEvent.setup();
    render(<ReputationLookup />);

    const chip = await screen.findByRole('button', { name: `Look up ${recent}` });
    await user.click(chip);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(recent)),
        expect.anything(),
      ),
    );
    expect(screen.getByLabelText('Freelancer address')).toHaveValue(recent);
  });

  it('does not break when the stored history is corrupted', () => {
    localStorage.setItem(REPUTATION_HISTORY_KEY, '{not json');
    render(<ReputationLookup />);

    expect(screen.getByLabelText('Freelancer address')).toHaveValue('');
    expect(screen.queryByText('Recent lookups')).not.toBeInTheDocument();
  });

  it('does not break when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    render(<ReputationLookup />);
    expect(screen.getByLabelText('Freelancer address')).toBeInTheDocument();
  });

  it('supports keyboard-only operation', async () => {
    const user = userEvent.setup();
    render(<ReputationLookup />);

    const input = screen.getByLabelText('Freelancer address');
    await user.tab();
    expect(document.activeElement).toBe(input);
    await user.tab();
    expect(document.activeElement).toBe(lookUpButton());

    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Enter a Stellar address.'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
