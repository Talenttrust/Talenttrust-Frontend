'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { site } from '@/lib/site';

export const ACTIVITY_POLL_MS = 30_000;
const MAX_ITEMS = 10;

interface FeedItem {
  key: string;
  id: string;
  ledger: number;
  closedAt: string;
  txHash: string;
  sentence: string;
}

type Status = 'loading' | 'ready' | 'error';

// The SDK is loaded lazily so the feed never adds to the landing page's initial bundle.
async function loadFeedItems(): Promise<FeedItem[]> {
  const { fetchRecentEvents, describeEvent } = await import('@/lib/stellar/events');
  const events = await fetchRecentEvents({ limit: MAX_ITEMS });
  return events.map((e) => ({
    key: e.key,
    id: e.id,
    ledger: e.ledger,
    closedAt: e.closedAt,
    txHash: e.txHash,
    sentence: describeEvent(e),
  }));
}

function mergeItems(previous: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  const byKey = new Map(previous.map((item) => [item.key, item]));
  for (const item of incoming) byKey.set(item.key, item);
  return [...byKey.values()]
    .sort((a, b) => b.ledger - a.ledger || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(0, MAX_ITEMS);
}

function errorDetail(error: unknown): string {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  if (typeof status === 'number') return `The Stellar RPC responded with HTTP ${status}.`;
  return 'The Stellar RPC could not be reached.';
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

export function formatRelativeTime(iso: string, now: number, locale?: string): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (!Number.isFinite(seconds)) return '';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(seconds) < 10) return rtf.format(0, 'second');
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') return rtf.format(Math.round(seconds / size), unit);
  }
  return '';
}

export function ActivityFeed({ pollIntervalMs = ACTIVITY_POLL_MS }: { pollIntervalMs?: number }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const loadedOnce = useRef(false);
  const itemsRef = useRef<FeedItem[]>([]);
  const lastAttemptAt = useRef<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    lastAttemptAt.current = Date.now();
    try {
      const incoming = await loadFeedItems();
      if (!mounted.current) return;
      const previousKeys = new Set(itemsRef.current.map((item) => item.key));
      const merged = mergeItems(itemsRef.current, incoming);
      setFresh(loadedOnce.current ? new Set(merged.filter((i) => !previousKeys.has(i.key)).map((i) => i.key)) : new Set());
      itemsRef.current = merged;
      loadedOnce.current = true;
      setItems(merged);
      setError(null);
      setStatus('ready');
    } catch (err) {
      if (!mounted.current) return;
      setError(errorDetail(err));
      setStatus(loadedOnce.current ? 'ready' : 'error');
    } finally {
      inFlight.current = false;
      if (mounted.current) setNow(Date.now());
    }
  }, []);

  const retry = useCallback(() => {
    if (!loadedOnce.current) setStatus('loading');
    void load();
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    // The feed sits below the fold: only fetch and poll while it is on screen and the tab is visible.
    let onScreen = typeof IntersectionObserver === 'undefined';

    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const sync = () => {
      stop();
      if (!onScreen || document.visibilityState === 'hidden') return;
      if (lastAttemptAt.current === null || Date.now() - lastAttemptAt.current >= pollIntervalMs) void load();
      timer = setInterval(() => void load(), pollIntervalMs);
    };

    const observer =
      typeof IntersectionObserver === 'undefined' || !sectionRef.current
        ? null
        : new IntersectionObserver(
            (entries) => {
              onScreen = entries.some((entry) => entry.isIntersecting);
              sync();
            },
            { rootMargin: '200px 0px' },
          );
    if (observer && sectionRef.current) observer.observe(sectionRef.current);

    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      mounted.current = false;
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [load, pollIntervalMs]);

  return (
    <section ref={sectionRef} className="activity" aria-labelledby="activity-heading">
      <div className="activity-head">
        <h3 id="activity-heading">Recent on-chain activity</h3>
        <span className="activity-sub">Last 24h · updates every {Math.round(pollIntervalMs / 1000)}s</span>
      </div>

      {status === 'loading' && (
        <div role="status">
          <span className="sr-only">Loading recent activity…</span>
          <ul className="activity-skeleton" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i}>
                <span className="activity-skeleton-line" />
                <span className="activity-skeleton-line short" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === 'error' && (
        <div className="activity-error" role="alert">
          <p>Couldn&apos;t load recent activity. {error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && error && (
        <div className="activity-error activity-error-inline" role="alert">
          <p>Showing the last known activity. {error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && items.length === 0 && !error && (
        <p className="activity-empty" role="status">
          No activity in the last 24h
        </p>
      )}

      {status === 'ready' && items.length > 0 && (
        <ol className="activity-list" aria-labelledby="activity-heading">
          {items.map((item) => (
            <li key={item.key} className={fresh.has(item.key) ? 'activity-item activity-new' : 'activity-item'}>
              <p className="activity-sentence">{item.sentence}</p>
              <p className="activity-meta">
                <time dateTime={item.closedAt} title={new Date(item.closedAt).toLocaleString()}>
                  {formatRelativeTime(item.closedAt, now)}
                </time>
                <span aria-hidden="true"> · </span>
                <a
                  href={`https://stellar.expert/explorer/${site.network}/tx/${item.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View tx: ${item.sentence} (opens in a new tab)`}
                >
                  View tx
                </a>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
