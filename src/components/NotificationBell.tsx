'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useNotifications, useOptionalNotifications } from '@/components/NotificationsProvider';
import { ALL_WATCH_EVENT_TYPES, WATCH_EVENT_LABELS } from '@/lib/desktopNotifications';
import type { NotificationItem } from '@/lib/notifications';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/** Renders nothing when there is no NotificationsProvider (e.g. isolated component tests). */
export function NotificationBell() {
  return useOptionalNotifications() ? <NotificationBellPanel /> : null;
}

function NotificationBellPanel() {
  const { items, unread, markAllRead, markRead, dismiss, clear, announcement } = useNotifications();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const desktopToggleId = useId();
  const desktopStatusId = useId();

  // The acted-on item (and its button) disappears or changes, so keep focus inside the panel.
  const keepFocus = () => panelRef.current?.focus();

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  const desktopUnavailable = desktopPermission === 'unsupported' || desktopPermission === 'denied';
  const desktopChecked = desktopSettings.enabled && desktopPermission === 'granted';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="bell">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary btn-sm bell-button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className="bell-icon">
          &#128276;
        </span>
        {unread > 0 && (
          <span className="bell-badge" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>

      {open && (
        <div className="bell-panel" id={panelId} ref={panelRef} role="dialog" aria-label="Notifications" tabIndex={-1}>
          <div className="bell-panel-head">
            <strong>Notifications</strong>
            <div className="row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead} disabled={unread === 0}>
                Mark all read
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={clear} disabled={items.length === 0}>
                Clear
              </button>
            </div>
          </div>
          <div
            className="bell-desktop"
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <label
              htmlFor={desktopToggleId}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: desktopUnavailable ? 'not-allowed' : 'pointer' }}
            >
              <input
                id={desktopToggleId}
                type="checkbox"
                checked={desktopChecked}
                disabled={desktopUnavailable}
                aria-describedby={desktopUnavailable ? desktopStatusId : undefined}
                onChange={(e) => {
                  void setDesktopEnabled(e.target.checked);
                }}
              />
              <span className="small">
                <strong>Desktop notifications</strong> (when tab is hidden)
              </span>
            </label>

            {desktopPermission === 'denied' && (
              <p id={desktopStatusId} role="status" className="small muted" style={{ margin: '6px 0 0' }}>
                Desktop notifications are blocked by your browser. Allow notifications for this site in your browser settings to enable them.
              </p>
            )}

            {desktopPermission === 'unsupported' && (
              <p id={desktopStatusId} role="status" className="small muted" style={{ margin: '6px 0 0' }}>
                Desktop notifications are not supported in this browser.
              </p>
            )}

            {desktopPermission !== 'unsupported' && (
              <fieldset
                style={{
                  border: 0,
                  margin: '8px 0 0',
                  padding: 0,
                }}
              >
                <legend className="small muted" style={{ marginBottom: '4px' }}>
                  Alert on events
                </legend>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '4px 10px',
                  }}
                >
                  {ALL_WATCH_EVENT_TYPES.map((type) => (
                    <label
                      key={type}
                      className="small"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <input
                        type="checkbox"
                        checked={desktopSettings.types.includes(type)}
                        disabled={desktopUnavailable}
                        onChange={() => toggleDesktopType(type)}
                      />
                      <span>{WATCH_EVENT_LABELS[type]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          {updatesPaused && (
            <div className="bell-stale" role="status">
              <span>Updates paused, retrying. Notifications may be out of date.</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={dismissUpdatesPaused}>
                Dismiss
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <div className="bell-empty">
              <p style={{ margin: '0 0 6px' }}>No notifications yet.</p>
              <p className="small muted" style={{ margin: 0 }}>
                Watch an escrow from the <Link href="/contracts">Escrows dashboard</Link> to be alerted when it is funded,
                a milestone is released, or a dispute is opened.
              </p>
            </div>
          ) : (
            <ul className="bell-list">
              {items.map((item: NotificationItem) => (
                <li key={item.id} className={item.read ? 'bell-item' : 'bell-item bell-item-unread'}>
                  <Link href="/contracts" onClick={() => markRead(item.id)}>
                    <span className="bell-item-title">
                      {item.title}
                      {!item.read && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="small muted">{item.message}</span>
                    <time className="small muted" dateTime={new Date(item.createdAt).toISOString()}>
                      {timeAgo(item.createdAt)}
                    </time>
                  </Link>
                  <div className="bell-item-actions">
                    {!item.read && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-label="Mark notification read"
                        title="Mark read"
                        onClick={() => {
                          markRead(item.id);
                          keepFocus();
                        }}
                      >
                        <span aria-hidden="true">&#10003;</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label="Dismiss notification"
                      title="Dismiss"
                      onClick={() => {
                        dismiss(item.id);
                        keepFocus();
                      }}
                    >
                      <span aria-hidden="true">&#10005;</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
