import '@testing-library/jest-dom/vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

expect.extend(axeMatchers);

declare module 'vitest' {
  // Same type parameters as Vitest 5's Matchers so the declarations merge.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toHaveNoViolations(): R;
  }
}

afterEach(() => {
  cleanup();
});

// jsdom implements <dialog> parsing but not the modal methods.
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}

// Tests never talk to the Freighter browser extension: default to "no wallet".
// The real module posts messages to the extension asynchronously, which can
// outlive a test file's jsdom environment. Tests that need a wallet mock
// '@/lib/stellar/freighter' (or this module) themselves.
vi.mock('@stellar/freighter-api', () => ({
  isConnected: async () => ({ isConnected: false }),
  isAllowed: async () => ({ isAllowed: false }),
  setAllowed: async () => ({ isAllowed: false }),
  requestAccess: async () => ({ address: '', error: 'Freighter is not available in tests' }),
  getAddress: async () => ({ address: '' }),
  getNetwork: async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' }),
  getNetworkDetails: async () => ({
    network: 'TESTNET',
    networkUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }),
  signTransaction: async () => {
    throw new Error('Freighter is not available in tests');
  },
}));
