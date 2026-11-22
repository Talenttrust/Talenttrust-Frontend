import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ALL_WATCH_EVENT_TYPES,
  defaultDesktopSettings,
  DESKTOP_NOTIFY_KEY,
  DESKTOP_NOTIFY_VERSION,
  getPermission,
  loadDesktopSettings,
  notifyDesktop,
  requestPermission,
  saveDesktopSettings,
  type DesktopNotificationEvent,
} from '@/lib/desktopNotifications';

const sampleEvent: DesktopNotificationEvent = {
  escrowId: 42,
  type: 'disputed',
  title: 'Dispute opened',
  message: '#42 Website redesign: A dispute was opened.',
};

interface MockNotificationInstance {
  title: string;
  options?: NotificationOptions;
  onclick: ((this: Notification, ev: Event) => unknown) | null;
  close: ReturnType<typeof vi.fn>;
}

let createdNotifications: MockNotificationInstance[] = [];
const originalNotification = globalThis.Notification;
const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

function installMockNotification(
  permission: NotificationPermission = 'granted',
  requestResult: NotificationPermission = permission,
) {
  createdNotifications = [];
  const requestPermissionMock = vi.fn(async () => requestResult);

  class MockNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = requestPermissionMock;

    title: string;
    options?: NotificationOptions;
    onclick: ((this: Notification, ev: Event) => unknown) | null = null;
    close = vi.fn();

    constructor(title: string, options?: NotificationOptions) {
      this.title = title;
      this.options = options;
      createdNotifications.push(this);
    }
  }

  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: MockNotification,
  });

  return { MockNotification, requestPermissionMock };
}

function uninstallNotification() {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

beforeEach(() => {
  localStorage.clear();
  createdNotifications = [];
  vi.restoreAllMocks();
});

afterEach(() => {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: originalNotification,
  });
  if (originalVisibilityDescriptor) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
  }
});

describe('desktopNotifications settings store', () => {
  it('returns default settings when storage is empty', () => {
    expect(loadDesktopSettings()).toEqual({
      version: DESKTOP_NOTIFY_VERSION,
      enabled: false,
      types: [...ALL_WATCH_EVENT_TYPES],
    });
  });

  it('persists and reloads enabled flag and per-type filters', () => {
    const saved = saveDesktopSettings({
      version: DESKTOP_NOTIFY_VERSION,
      enabled: true,
      types: ['disputed', 'milestone_released'],
    });
    expect(saved).toBe(true);
    expect(loadDesktopSettings()).toEqual({
      version: DESKTOP_NOTIFY_VERSION,
      enabled: true,
      types: ['disputed', 'milestone_released'],
    });
  });

  it('resets corrupt JSON with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(DESKTOP_NOTIFY_KEY, '{not-json');
    expect(loadDesktopSettings()).toEqual(defaultDesktopSettings());
    expect(warn).toHaveBeenCalled();
  });

  it('resets unknown version with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(
      DESKTOP_NOTIFY_KEY,
      JSON.stringify({ version: 99, enabled: true, types: ['funded'] }),
    );
    expect(loadDesktopSettings()).toEqual(defaultDesktopSettings());
    expect(warn).toHaveBeenCalled();
  });

  it('resets invalid event types with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(
      DESKTOP_NOTIFY_KEY,
      JSON.stringify({ version: DESKTOP_NOTIFY_VERSION, enabled: true, types: ['funded', 'bogus'] }),
    );
    expect(loadDesktopSettings()).toEqual(defaultDesktopSettings());
    expect(warn).toHaveBeenCalled();
  });

  it('does not throw when storage is full', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(saveDesktopSettings(defaultDesktopSettings())).toBe(false);
  });
});

describe('desktopNotifications permission helpers', () => {
  it('reports unsupported when Notification is unavailable', async () => {
    uninstallNotification();
    expect(getPermission()).toBe('unsupported');
    expect(await requestPermission()).toBe('unsupported');
  });

  it('reads current permission and delegates requestPermission', async () => {
    const { requestPermissionMock } = installMockNotification('default', 'granted');
    expect(getPermission()).toBe('default');
    expect(await requestPermission()).toBe('granted');
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
  });
});

describe('notifyDesktop gating logic', () => {
  it('no-ops when Notification is unavailable', () => {
    uninstallNotification();
    setVisibility('hidden');
    saveDesktopSettings({ version: DESKTOP_NOTIFY_VERSION, enabled: true, types: ['disputed'] });
    expect(notifyDesktop(sampleEvent)).toBeNull();
  });

  it('no-ops when permission is not granted', () => {
    installMockNotification('default');
    setVisibility('hidden');
    saveDesktopSettings({ version: DESKTOP_NOTIFY_VERSION, enabled: true, types: ['disputed'] });
    expect(notifyDesktop(sampleEvent)).toBeNull();
    expect(createdNotifications).toHaveLength(0);

    installMockNotification('denied');
    expect(notifyDesktop(sampleEvent)).toBeNull();
    expect(createdNotifications).toHaveLength(0);
  });

  it('no-ops when tab is visible', () => {
    installMockNotification('granted');
    setVisibility('visible');
    saveDesktopSettings({ version: DESKTOP_NOTIFY_VERSION, enabled: true, types: ['disputed'] });
    expect(notifyDesktop(sampleEvent)).toBeNull();
    expect(createdNotifications).toHaveLength(0);
  });

  it('no-ops when desktop notifications are disabled in settings', () => {
    installMockNotification('granted');
    setVisibility('hidden');
    saveDesktopSettings({ version: DESKTOP_NOTIFY_VERSION, enabled: false, types: ['disputed'] });
    expect(notifyDesktop(sampleEvent)).toBeNull();
    expect(createdNotifications).toHaveLength(0);
  });

  it('no-ops when event type is filtered out', () => {
    installMockNotification('granted');
    setVisibility('hidden');
    saveDesktopSettings({ version: DESKTOP_NOTIFY_VERSION, enabled: true, types: ['funded'] });
    expect(notifyDesktop(sampleEvent)).toBeNull();
    expect(createdNotifications).toHaveLength(0);
  });

  it('shows notification with escrow+type tag when granted, hidden, enabled, and type allowed', () => {
    installMockNotification('granted');
    setVisibility('hidden');
    saveDesktopSettings({ version: DESKTOP_NOTIFY_VERSION, enabled: true, types: ['disputed'] });

    const n = notifyDesktop(sampleEvent);
    expect(n).not.toBeNull();
    expect(createdNotifications).toHaveLength(1);
    expect(createdNotifications[0].title).toBe('Dispute opened');
    expect(createdNotifications[0].options).toEqual({
      body: sampleEvent.message,
      tag: 'tt-escrow-42-disputed',
    });
  });

  it('focuses window and navigates to /contracts?q=<id> on click', () => {
    installMockNotification('granted');
    setVisibility('hidden');
    saveDesktopSettings({ version: DESKTOP_NOTIFY_VERSION, enabled: true, types: ['disputed'] });

    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });

    try {
      notifyDesktop(sampleEvent);
      expect(createdNotifications).toHaveLength(1);
      createdNotifications[0].onclick?.call(createdNotifications[0] as unknown as Notification, new Event('click'));

      expect(focusSpy).toHaveBeenCalledTimes(1);
      expect(assignSpy).toHaveBeenCalledWith('/contracts?q=42');
      expect(createdNotifications[0].close).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
