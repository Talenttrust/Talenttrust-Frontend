import React from 'react';
import '@testing-library/jest-dom';

// Mock matchMedia (not implemented in jsdom)
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
  global.requestIdleCallback = (cb: any) => setTimeout(() => cb({ timeRemaining: () => 50 }), 0);
  global.cancelIdleCallback = (id: any) => clearTimeout(id);
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
