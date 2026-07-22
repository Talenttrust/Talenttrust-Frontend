var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, symbols = Object.getOwnPropertySymbols(s); i < symbols.length; i++) {
            if (e.indexOf(symbols[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, symbols[i]))
                t[symbols[i]] = s[symbols[i]];
        }
    return t;
};
import '@testing-library/jest-dom';
import { toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);
// Mock matchMedia (not implemented in jsdom)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
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
    const MockLink = (_a) => {
        var { children, href } = _a, props = __rest(_a, ["children", "href"]);
        return React.createElement('a', Object.assign({ href }, props), children);
    };
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
    global.requestIdleCallback = (cb) => setTimeout(() => cb({ timeRemaining: () => 50 }), 0);
    global.cancelIdleCallback = (id) => clearTimeout(id);
}
// Provide a simple IntersectionObserver stub so next/use-intersection does not schedule async work
class MockIntersectionObserver {
    constructor() { }
    observe() { }
    unobserve() { }
    disconnect() { }
}
if (typeof global.IntersectionObserver === 'undefined') {
    global.IntersectionObserver = MockIntersectionObserver;
}
// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => { var _a; return (_a = store[key]) !== null && _a !== void 0 ? _a : null; },
        setItem: (key, value) => { store[key] = value; },
        clear: () => { store = {}; },
        removeItem: (key) => { delete store[key]; },
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
// Global mock for WalletContext so components using useWallet work without a provider
jest.mock('@/contexts/WalletContext', () => ({
    useWallet: jest.fn().mockReturnValue({
        address: 'GBDGTR4S5O3K7I6E7K5QH3Y2W6Z4JFQ2X3C5V7M8N9P0Q1R2S3T4U5V6W7X',
        isConnecting: false,
        error: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
    }),
    WalletProvider: ({ children }) => children,
}));
