import React from 'react';
import '@testing-library/jest-dom';
import { toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

// Mock matchMedia (not implemented in jsdom).
// Guarded because some suites (e.g. *.ssr.test.ts files simulating SSR)
// intentionally run under the `node` test environment, where `window` does
// not exist at all.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock next/link to a plain <a> to avoid intersection/prefetch behavior
jest.mock('next/link', () => {
  const React = require('react');
  const MockLink = ({ children, href, ...props }: any) => React.createElement('a', { href, ...props }, children);
  MockLink.displayName = 'MockNextLink';
  return MockLink;
});

// Mock next/navigation hooks used by app components
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Polyfill requestIdleCallback / cancelIdleCallback used by next's request-idle-callback
if (typeof global.requestIdleCallback === 'undefined') {
  global.requestIdleCallback = (cb: any) => setTimeout(() => cb({ timeRemaining: () => 50 }), 0) as unknown as number;
  global.cancelIdleCallback = (id: any) => clearTimeout(id as any);
}

// Provide a simple IntersectionObserver stub so next/use-intersection does not schedule async work
class MockIntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof global.IntersectionObserver === 'undefined') {
  global.IntersectionObserver = MockIntersectionObserver as any;
}

// Mock localStorage (guarded — see the `matchMedia` note above).
if (typeof window !== 'undefined') {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      get length() { return Object.keys(store).length; },
      key: (index: number) => Object.keys(store)[index] ?? null,
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      clear: () => { store = {}; },
      removeItem: (key: string) => { delete store[key]; },
    };
  })();
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });
}

// Global mock for WalletContext so components using useWallet work without a
// provider. A module factory replaces the *whole* module, so every export the
// real module gains has to be listed here or it arrives as `undefined` at the
// call site. `useWalletAddress` is the non-throwing sibling of `useWallet` and
// both must report the same identity, or a component that reads the address
// through one and the connection state through the other would disagree.
const mockWalletAddress =
  'GBDGTR4S5O3K7I6E7K5QH3Y2W6Z4JFQ2X3C5V7M8N9P0Q1R2S3T4U5V6W7X';

jest.mock('@/contexts/WalletContext', () => ({
  useWallet: jest.fn().mockReturnValue({
    address: mockWalletAddress,
    isConnecting: false,
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
  useWalletAddress: jest.fn().mockReturnValue(mockWalletAddress),
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
}));
