/**
 * fakeSoroban.ts — a configurable fake Soroban RPC server + fake Freighter
 * wallet for integration tests.
 *
 * Why this exists
 * ---------------
 * The on-chain actions flow (build → simulate → sign → submit → poll) spans
 * three modules: `src/lib/stellar/escrow.ts` (transaction builders),
 * `src/lib/stellar/submit.ts` (the pipeline) and
 * `src/lib/stellar/freighter.ts` (wallet signing), all talking to the chain
 * through `getRpcServer()` from `src/lib/stellar/rpc.ts`. Mocking the
 * builders or the pipeline (as the component unit tests do) never exercises
 * that path together. This fake replaces only the two outer boundaries —
 * the RPC server and the wallet — so the real builders and the real pipeline
 * run end to end in tests.
 *
 * Usage
 * -----
 * ```ts
 * import {
 *   createFakeSoroban,
 *   installFakeSoroban,
 *   buildEscrowScVal,
 * } from '@/test/fakeSoroban';
 *
 * // Swap the RPC module's server for the fake, keep everything else real.
 * vi.mock('@/lib/stellar/rpc', async (importOriginal) => {
 *   const actual = await importOriginal<typeof import('@/lib/stellar/rpc')>();
 *   const fake = await import('@/test/fakeSoroban');
 *   return fake.rpcModuleWithFake(actual);
 * });
 *
 * // Swap the wallet module for the fake Freighter.
 * vi.mock('@/lib/stellar/freighter', async () => {
 *   const fake = await import('@/test/fakeSoroban');
 *   return fake.freighterModuleWithFake();
 * });
 *
 * const fake = createFakeSoroban({
 *   readRetval: buildEscrowScVal(myEscrow), // what get_contract returns
 *   walletAddress: CLIENT,
 * });
 * installFakeSoroban(fake);
 * // … render / call …
 * expect(fake.calls).toContain('signTransaction');
 * ```
 *
 * Scripting
 * ---------
 * Behaviour is driven by the `script` object passed to `createFakeSoroban`
 * (also mutable afterwards via `fake.script`):
 * - `readRetval`            ScVal returned for `get_contract` simulations.
 * - `actionSimulateError`   error string returned for non-read simulations,
 *                           e.g. 'Error(Contract, #10)'.
 * - `pollSequence`          getTransaction statuses, consumed in order; the
 *                           last entry repeats. Default ['SUCCESS'].
 * - `sendError`             make sendTransaction return status 'ERROR'.
 * - `hash`                  transaction hash returned by sendTransaction.
 * - `signRejection`         Error the fake wallet throws from signTransaction.
 * - `walletAddress`         address the fake wallet reports / signs for.
 * - `onSimulate` / `onSign` async hooks awaited inside the fake; return a
 *                           deferred promise to pause the pipeline mid-stage
 *                           (e.g. to assert progress labels in order).
 *
 * Every RPC/wallet call is recorded in order in `fake.calls`
 * ('getAccount', 'simulateTransaction', 'signTransaction', 'sendTransaction',
 * 'getTransaction') so tests can assert the pipeline order.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Account,
  Address,
  Networks,
  SorobanDataBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import type { OnChainEscrow } from '@/lib/stellar/escrow';

export const FAKE_TX_HASH =
  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

export type FakePollStatus = 'NOT_FOUND' | 'SUCCESS' | 'FAILED';

export interface FakeSorobanScript {
  /** Sequence number for accounts returned by getAccount. Default '0'. */
  accountSequence?: string;
  /** ScVal a `get_contract` simulation returns (see buildEscrowScVal). */
  readRetval?: xdr.ScVal;
  /** Error string for non-read simulations, e.g. 'Error(Contract, #10)'. */
  actionSimulateError?: string;
  /** getTransaction statuses in order; the last one repeats. */
  pollSequence?: FakePollStatus[];
  /** Make sendTransaction return status 'ERROR'. */
  sendError?: boolean;
  /** Hash returned by sendTransaction. Default FAKE_TX_HASH. */
  hash?: string;
  /** When set, the fake wallet's signTransaction throws this error. */
  signRejection?: Error;
  /** Address the fake wallet reports from getAddress. */
  walletAddress?: string;
  /** Awaited inside simulateTransaction; receives the contract fn name. */
  onSimulate?: (functionName: string | null) => Promise<void>;
  /** Awaited inside the wallet's signTransaction. */
  onSign?: () => Promise<void>;
}

export interface FakeSoroban {
  /** Drop-in replacement for the object returned by getRpcServer(). */
  server: {
    getAccount: (address: string) => Promise<Account>;
    simulateTransaction: (tx: unknown) => Promise<unknown>;
    sendTransaction: (tx: unknown) => Promise<unknown>;
    getTransaction: (hash: string) => Promise<unknown>;
  };
  /** Drop-in replacement for the @/lib/stellar/freighter module surface. */
  freighter: {
    signTransaction: (
      xdr: string,
      opts: { networkPassphrase: string; address?: string }
    ) => Promise<string>;
    getAddress: () => Promise<string | null>;
    getNetworkPassphrase: () => Promise<string>;
  };
  /** Ordered log of every RPC / wallet call the pipeline made. */
  calls: string[];
  /** The live script; mutate it mid-test to change behaviour. */
  script: FakeSorobanScript;
}

/** Extract the invoked contract function name from a built transaction. */
function functionNameOf(tx: any): string | null {
  try {
    // functionName is an XdrString in the installed SDK, not a plain string.
    const fn = tx?.operations?.[0]?.func?.invokeContract?.functionName;
    if (fn == null) return null;
    const name = typeof fn === 'string' ? fn : String(fn);
    return name || null;
  } catch {
    return null;
  }
}

/** A minimal, valid SorobanTransactionData for assembled transactions. */
function emptySorobanData(): xdr.SorobanTransactionData {
  return new xdr.SorobanTransactionData({
    ext: xdr.ExtensionPoint.v0(),
    resources: new xdr.SorobanResources({
      footprint: new xdr.LedgerFootprint({ readOnly: [], readWrite: [] }),
      instructions: 0,
      diskReadBytes: 0,
      writeBytes: 0,
    }),
    resourceFee: xdr.Int64.fromString('100'),
  });
}

/** A parsed SimulateTransaction success response, as rpc.Server returns it. */
function simulateSuccess(retval: xdr.ScVal): unknown {
  return {
    _parsed: true,
    id: 'fake-simulation',
    latestLedger: 1000,
    events: [],
    minResourceFee: '100',
    transactionData: new SorobanDataBuilder(emptySorobanData()),
    result: { auth: [], retval },
    cost: { cpuInsns: '0', memBytes: '0' },
  };
}

export function createFakeSoroban(script: FakeSorobanScript = {}): FakeSoroban {
  const calls: string[] = [];
  let pollIndex = 0;

  const server: FakeSoroban['server'] = {
    async getAccount(address: string) {
      calls.push('getAccount');
      return new Account(address, script.accountSequence ?? '0');
    },

    async simulateTransaction(tx: unknown) {
      calls.push('simulateTransaction');
      const fn = functionNameOf(tx);
      if (script.onSimulate) await script.onSimulate(fn);
      if (fn === 'get_contract') {
        if (!script.readRetval) {
          throw new Error(
            'fakeSoroban: script.readRetval is required to answer a get_contract simulation (see buildEscrowScVal).'
          );
        }
        return simulateSuccess(script.readRetval);
      }
      if (script.actionSimulateError) {
        return {
          id: 'fake-simulation',
          latestLedger: 1000,
          events: [],
          error: script.actionSimulateError,
        };
      }
      return simulateSuccess(xdr.ScVal.scvVoid());
    },

    async sendTransaction() {
      calls.push('sendTransaction');
      const hash = script.hash ?? FAKE_TX_HASH;
      if (script.sendError) {
        return { status: 'ERROR', hash, latestLedger: 1000 };
      }
      return { status: 'PENDING', hash, latestLedger: 1000 };
    },

    async getTransaction() {
      calls.push('getTransaction');
      const seq = script.pollSequence ?? ['SUCCESS'];
      const status = seq[Math.min(pollIndex++, seq.length - 1)];
      return { status, latestLedger: 1000 };
    },
  };

  const freighter: FakeSoroban['freighter'] = {
    async signTransaction(txXdr: string) {
      calls.push('signTransaction');
      if (script.onSign) await script.onSign();
      if (script.signRejection) throw script.signRejection;
      // Pass-through "signature": the pipeline only re-parses the envelope.
      return txXdr;
    },
    async getAddress() {
      return script.walletAddress ?? null;
    },
    async getNetworkPassphrase() {
      return Networks.TESTNET;
    },
  };

  return { server, freighter, calls, script };
}

/**
 * Encode an OnChainEscrow as the ScVal map the escrow contract's
 * `get_contract` returns, for use as `script.readRetval`.
 */
export function buildEscrowScVal(escrow: OnChainEscrow): xdr.ScVal {
  const entry = (key: string, val: xdr.ScVal) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
  const i128 = (n: bigint) => nativeToScVal(n, { type: 'i128' });
  const addr = (a: string) => Address.fromString(a).toScVal();

  return xdr.ScVal.scvMap([
    entry('client', addr(escrow.client)),
    entry('freelancer', addr(escrow.freelancer)),
    entry('token', addr(escrow.token)),
    entry('total_amount', i128(escrow.totalAmount)),
    entry('funded_amount', i128(escrow.fundedAmount)),
    entry('released_amount', i128(escrow.releasedAmount)),
    entry('status', xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(escrow.status)])),
    entry(
      'milestones',
      xdr.ScVal.scvVec(
        escrow.milestones.map((m) =>
          xdr.ScVal.scvMap([
            entry('title', xdr.ScVal.scvString(m.title)),
            entry('amount', i128(m.amount)),
            entry('released', xdr.ScVal.scvBool(m.released)),
          ])
        )
      )
    ),
  ]);
}

// ── vi.mock wiring ──────────────────────────────────────────────────────────
// One installed fake per test file; installFakeSoroban swaps it between tests.

let installed: FakeSoroban | null = null;

export function installFakeSoroban(fake: FakeSoroban | null): void {
  installed = fake;
}

export function getFakeSoroban(): FakeSoroban {
  if (!installed) {
    throw new Error(
      'fakeSoroban: no fake installed. Call installFakeSoroban(createFakeSoroban(...)) in your test setup first.'
    );
  }
  return installed;
}

/** Spread into a vi.mock factory for '@/lib/stellar/rpc' (see header docs). */
export function rpcModuleWithFake<T extends object>(actual: T): T {
  return {
    ...actual,
    getRpcServer: () => getFakeSoroban().server,
  };
}

/** Return from a vi.mock factory for '@/lib/stellar/freighter'. */
export function freighterModuleWithFake(): FakeSoroban['freighter'] {
  return {
    signTransaction: (txXdr, opts) =>
      getFakeSoroban().freighter.signTransaction(txXdr, opts),
    getAddress: () => getFakeSoroban().freighter.getAddress(),
    getNetworkPassphrase: () =>
      getFakeSoroban().freighter.getNetworkPassphrase(),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
