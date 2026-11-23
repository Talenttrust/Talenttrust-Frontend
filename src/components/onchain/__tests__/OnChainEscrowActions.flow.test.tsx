/**
 * Integration tests for the on-chain actions flow.
 *
 * Unlike OnChainEscrowActions.test.tsx (which mocks the escrow builders and
 * the submit pipeline), these tests mock only the outer boundaries — the
 * Soroban RPC server and the Freighter wallet, via src/test/fakeSoroban.ts —
 * so the real build → simulate → sign → submit → poll path runs end to end:
 *
 *   OnChainEscrowActions → buildReleaseTx (escrow.ts)
 *     → simulateSignSubmit (submit.ts) → fake RPC + fake Freighter
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import OnChainEscrowActions from '../OnChainEscrowActions';
import { useWallet } from '@/components/wallet/WalletProvider';
import {
  createFakeSoroban,
  installFakeSoroban,
  buildEscrowScVal,
  FAKE_TX_HASH,
  type FakeSoroban,
} from '@/test/fakeSoroban';
import type { OnChainEscrow } from '@/lib/stellar/escrow';
import { escrowErrorMessage, parseContractError } from '@/lib/stellar/errors';

// jsdom swaps in its own Uint8Array realm, which the SDK's XDR validation
// rejects; restore Node's constructor before any transaction is built.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Uint8Array = Object.getPrototypeOf(Buffer);

vi.mock('@/components/wallet/WalletProvider');

// Only the boundaries are faked: the RPC server and the wallet module.
// The action path (build → simulate → sign → send → poll) runs end-to-end
// against the fake server. The getContract read goes through rpc.ts's own
// simulateRead helper, whose internal getRpcServer() call cannot be reached
// by a module mock, so simulateRead itself is stubbed from the same fake's
// script.
vi.mock('@/lib/stellar/rpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stellar/rpc')>();
  const fake = await import('@/test/fakeSoroban');
  return {
    ...fake.rpcModuleWithFake(actual),
    simulateRead: async () => {
      const installed = fake.getFakeSoroban();
      if (!installed) throw new Error('fake Soroban not installed');
      const { xdr } = await import('@stellar/stellar-sdk');
      const rv = installed.script.readRetval;
      if (rv === undefined) throw new Error('readRetval not scripted');
      return rv instanceof xdr.ScVal ? rv : fake.buildEscrowScVal(rv);
    },
  };
});
vi.mock('@/lib/stellar/freighter', async () => {
  const fake = await import('@/test/fakeSoroban');
  return fake.freighterModuleWithFake();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseWallet = useWallet as unknown as ReturnType<typeof vi.fn>;

const CLIENT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const FREELANCER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

const FUNDED_ESCROW: OnChainEscrow = {
  id: 1,
  client: CLIENT,
  freelancer: FREELANCER,
  token: TOKEN,
  totalAmount: 100_000_000n,
  fundedAmount: 100_000_000n,
  releasedAmount: 0n,
  status: 'Funded',
  milestones: [{ title: 'Design', amount: 50_000_000n, released: false }],
};

let fake: FakeSoroban;

function installFake(script: Parameters<typeof createFakeSoroban>[0] = {}) {
  fake = createFakeSoroban({
    readRetval: buildEscrowScVal(FUNDED_ESCROW),
    walletAddress: CLIENT,
    ...script,
  });
  installFakeSoroban(fake);
}

beforeEach(() => {
  mockUseWallet.mockReturnValue({
    address: CLIENT,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  installFake();
});

afterEach(() => {
  installFakeSoroban(null);
  vi.useRealTimers();
});

async function renderAndLoad() {
  render(<OnChainEscrowActions id={1} />);
  return screen.findByRole('button', { name: /release milestone 1/i });
}

describe('on-chain actions flow (fake RPC + fake Freighter)', () => {
  it(
    'release: runs build → simulate → sign → submit → poll, shows progress labels in order, and links the confirmed tx',
    async () => {
      // Gate the simulate and sign stages so each progress label can be
      // observed before the pipeline is allowed to move on.
      let releaseSimulate!: () => void;
      let releaseSign!: () => void;
      const simulateGate = new Promise<void>((r) => (releaseSimulate = r));
      const signGate = new Promise<void>((r) => (releaseSign = r));
      fake.script.onSimulate = (fn) =>
        fn === 'get_contract' ? Promise.resolve() : simulateGate;
      fake.script.onSign = () => signGate;

      const releaseButton = await renderAndLoad();
      fireEvent.click(releaseButton);

      expect(
        await screen.findByText('Simulating transaction…')
      ).toBeInTheDocument();
      await act(async () => {
        releaseSimulate();
      });

      expect(
        await screen.findByText('Waiting for signature…')
      ).toBeInTheDocument();
      await act(async () => {
        releaseSign();
      });

      expect(await screen.findByText('Submitting…')).toBeInTheDocument();

      const link = await screen.findByRole(
        'link',
        { name: /view on explorer/i },
        { timeout: 10_000 }
      );
      expect(link).toHaveAttribute(
        'href',
        `https://stellar.expert/explorer/testnet/tx/${FAKE_TX_HASH}`
      );
      expect(screen.getByRole('status')).toHaveTextContent('Confirmed!');

      // The pipeline hit the boundaries in order: read simulate (load),
      // action simulate, wallet sign, submit, poll.
      const order = [
        'simulateTransaction',
        'signTransaction',
        'sendTransaction',
        'getTransaction',
      ].map((c) => fake.calls.indexOf(c));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      // The read for the initial load ran before any signing happened.
      expect(fake.calls.indexOf('simulateTransaction')).toBeLessThan(
        fake.calls.indexOf('signTransaction')
      );
    },
    15_000
  );

  it('simulation error: shows the mapped contract error and never reaches the wallet', async () => {
    installFake({ actionSimulateError: 'Error(Contract, #10)' });

    const releaseButton = await renderAndLoad();
    fireEvent.click(releaseButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(escrowErrorMessage(10)!);
    expect(fake.calls).not.toContain('signTransaction');
    expect(fake.calls).not.toContain('sendTransaction');
  });

  it('wallet rejection: shows the cancellation message and never submits', async () => {
    installFake({
      signRejection: new Error('User cancelled the signature request'),
    });

    const releaseButton = await renderAndLoad();
    fireEvent.click(releaseButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Signature rejected: you cancelled the request in your wallet.'
    );
    expect(fake.calls).toContain('signTransaction');
    expect(fake.calls).not.toContain('sendTransaction');
  });

  it(
    'poll timeout: a transaction that never lands surfaces the RPC timeout error',
    async () => {
      vi.useFakeTimers();
      installFake({ pollSequence: ['NOT_FOUND'] });

      render(<OnChainEscrowActions id={1} />);
      // Flush the (timer-free) contract load.
      await act(async () => {});
      const releaseButton = screen.getByRole('button', {
        name: /release milestone 1/i,
      });

      await act(async () => {
        fireEvent.click(releaseButton);
      });
      // Drive the poll loop past its 30 s deadline.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        parseContractError(new Error('RPC timeout'))
      );
      expect(fake.calls).toContain('sendTransaction');
      expect(fake.calls.filter((c) => c === 'getTransaction').length).toBeGreaterThan(1);
    },
    15_000
  );
});
