import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ServiceWorkerRegister from '../ServiceWorkerRegister';
import OfflineIndicator from '../OfflineIndicator';

// ── Mocks ─────────────────────────────────────────────────────────────

// Track serviceWorker mock state across tests
let mockController: ServiceWorker | null = null;
const mockRegister = jest.fn();
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();

const mockWaiting = {
  postMessage: jest.fn(),
} as unknown as ServiceWorker;

function createMockRegistration(waiting?: ServiceWorker): ServiceWorkerRegistration {
  return {
    waiting: waiting ?? null,
    installing: null,
    active: mockController,
    scope: '/',
    update: jest.fn(),
    unregister: jest.fn(),
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    showNotification: jest.fn(),
    getNotifications: jest.fn().mockResolvedValue([]),
  } as unknown as ServiceWorkerRegistration;
}

// ── ServiceWorkerRegister tests ───────────────────────────────────────

describe('ServiceWorkerRegister', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockController = null;
    process.env.NODE_ENV = 'production';

    mockRegister.mockResolvedValue(createMockRegistration());

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: mockRegister,
        controller: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        ready: Promise.resolve(createMockRegistration()),
        getRegistrations: jest.fn().mockResolvedValue([]),
      },
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('renders nothing when no update is available', () => {
    render(<ServiceWorkerRegister />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('registers the service worker in production', async () => {
    render(<ServiceWorkerRegister />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockRegister).toHaveBeenCalledWith('/sw.js');
  });

  it('shows update prompt when a waiting worker exists', async () => {
    const reg = createMockRegistration(mockWaiting);

    mockRegister.mockResolvedValue(reg);

    render(<ServiceWorkerRegister />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Update available')).toBeInTheDocument();
  });

  it('calls postMessage(SKIP_WAITING) when Reload is clicked', async () => {
    const reg = createMockRegistration(mockWaiting);
    mockRegister.mockResolvedValue(reg);

    render(<ServiceWorkerRegister />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const reloadButton = screen.getByText('Reload');
    fireEvent.click(reloadButton);

    expect(mockWaiting.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
  });

  it('can dismiss the update prompt', async () => {
    const reg = createMockRegistration(mockWaiting);
    mockRegister.mockResolvedValue(reg);

    render(<ServiceWorkerRegister />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();

    const dismissButton = screen.getByLabelText('Dismiss update notification');
    fireEvent.click(dismissButton);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not register in development', () => {
    process.env.NODE_ENV = 'development';
    render(<ServiceWorkerRegister />);

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('handles serviceWorker not being available gracefully', () => {
    // Remove serviceWorker from navigator entirely
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });

    // Should not throw — the component checks 'serviceWorker' in navigator
    expect(() => {
      render(<ServiceWorkerRegister />);
    }).not.toThrow();
  });
});

// ── OfflineIndicator tests ────────────────────────────────────────────

describe('OfflineIndicator', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('renders nothing when online', () => {
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('renders offline indicator when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    render(<OfflineIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('updates when going from online to offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });

    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('updates when going from offline to online', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    const { container } = render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(container.firstChild).toBeNull();
  });

  it('uses role=status for screen reader announcements', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    render(<OfflineIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });
});
