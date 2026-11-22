import type { WatchEventType } from './watchlist';

export const DESKTOP_NOTIFY_KEY = 'tt.desktopNotify.v1';
export const DESKTOP_NOTIFY_VERSION = 1;

export const ALL_WATCH_EVENT_TYPES: readonly WatchEventType[] = [
  'funded',
  'milestone_released',
  'disputed',
  'resolved',
  'cancelled',
  'completed',
];

export const WATCH_EVENT_LABELS: Record<WatchEventType, string> = {
  funded: 'Escrow funded',
  milestone_released: 'Milestone released',
  disputed: 'Dispute opened',
  resolved: 'Dispute resolved',
  cancelled: 'Escrow cancelled',
  completed: 'Escrow completed',
};

const VALID_EVENT_TYPES = new Set<string>(ALL_WATCH_EVENT_TYPES);

export type DesktopNotificationPermission = NotificationPermission | 'unsupported';

export interface DesktopNotifySettings {
  version: number;
  enabled: boolean;
  types: WatchEventType[];
}

export interface DesktopNotificationEvent {
  escrowId: number;
  type: WatchEventType;
  title: string;
  message: string;
}

export function defaultDesktopSettings(): DesktopNotifySettings {
  return {
    version: DESKTOP_NOTIFY_VERSION,
    enabled: false,
    types: [...ALL_WATCH_EVENT_TYPES],
  };
}

function isValidWatchEventType(value: unknown): value is WatchEventType {
  return typeof value === 'string' && VALID_EVENT_TYPES.has(value);
}

function isValidSettings(value: unknown): value is DesktopNotifySettings {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== DESKTOP_NOTIFY_VERSION) return false;
  if (typeof v.enabled !== 'boolean') return false;
  if (!Array.isArray(v.types)) return false;
  return v.types.every(isValidWatchEventType);
}

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadDesktopSettings(): DesktopNotifySettings {
  const s = storage();
  if (!s) return defaultDesktopSettings();
  let raw: string | null = null;
  try {
    raw = s.getItem(DESKTOP_NOTIFY_KEY);
  } catch {
    return defaultDesktopSettings();
  }
  if (!raw) return defaultDesktopSettings();
  try {
    const parsed = JSON.parse(raw);
    if (!isValidSettings(parsed)) {
      console.warn('Desktop notification settings were in an unknown format and have been reset.');
      const fallback = defaultDesktopSettings();
      saveDesktopSettings(fallback);
      return fallback;
    }
    const uniqueTypes = Array.from(new Set(parsed.types));
    return {
      version: DESKTOP_NOTIFY_VERSION,
      enabled: parsed.enabled,
      types: uniqueTypes,
    };
  } catch {
    console.warn('Desktop notification settings were corrupt and have been reset.');
    const fallback = defaultDesktopSettings();
    saveDesktopSettings(fallback);
    return fallback;
  }
}

export function saveDesktopSettings(settings: DesktopNotifySettings): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const uniqueTypes = Array.from(new Set(settings.types.filter(isValidWatchEventType)));
    s.setItem(
      DESKTOP_NOTIFY_KEY,
      JSON.stringify({
        version: DESKTOP_NOTIFY_VERSION,
        enabled: settings.enabled,
        types: uniqueTypes,
      }),
    );
    return true;
  } catch {
    console.warn('Could not persist desktop notification settings (storage full or unavailable).');
    return false;
  }
}

export function getPermission(): DesktopNotificationPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestPermission(): Promise<DesktopNotificationPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return getPermission();
  }
}

export function notifyDesktop(
  event: DesktopNotificationEvent,
  settings?: DesktopNotifySettings,
): Notification | null {
  if (typeof Notification === 'undefined') return null;
  if (Notification.permission !== 'granted') return null;
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return null;

  const cfg = settings ?? loadDesktopSettings();
  if (!cfg.enabled) return null;
  if (!cfg.types.includes(event.type)) return null;

  const notification = new Notification(event.title, {
    body: event.message,
    tag: `tt-escrow-${event.escrowId}-${event.type}`,
  });

  notification.onclick = () => {
    if (typeof window !== 'undefined') {
      window.focus();
      window.location.assign(`/contracts?q=${event.escrowId}`);
    }
    notification.close();
  };

  return notification;
}
