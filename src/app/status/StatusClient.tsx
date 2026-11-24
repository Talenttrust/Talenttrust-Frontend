'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  checkApi,
  checkChainConfig,
  checkContract,
  checkRpc,
  aggregateState,
  type StatusResult,
  type CheckState,
  type ChainConfigResult,
} from '@/lib/status';
import { site } from '@/lib/site';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const AUTO_REFRESH_MS = 30_000;
export const HISTORY_LIMIT = 20;
export const HISTORY_STORAGE_KEY = 'talenttrust:status-history';

export interface CheckHistoryEntry {
  state: CheckState;
  /** ISO timestamp of the completed check. */
  at: string;
}

export type CheckKey = 'api' | 'chain' | 'rpc' | 'contract';
export type CheckHistory = Record<CheckKey, CheckHistoryEntry[]>;

const CHECK_KEYS: CheckKey[] = ['api', 'chain', 'rpc', 'contract'];

export function emptyHistory(): CheckHistory {
  return { api: [], chain: [], rpc: [], contract: [] };
}

function isCheckState(value: unknown): value is CheckState {
  return value === 'operational' || value === 'degraded' || value === 'down';
}

function parseHistoryEntry(value: unknown): CheckHistoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const { state, at } = value as { state?: unknown; at?: unknown };
  if (!isCheckState(state) || typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  return { state, at };
}

/** Read the stored history, tolerating missing or corrupted sessionStorage. */
export function loadHistory(): CheckHistory {
  const empty = emptyHistory();
  if (typeof window === 'undefined') return empty;

  try {
    const raw = window.sessionStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return empty;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;

    const record = parsed as Record<string, unknown>;
    for (const key of CHECK_KEYS) {
      const value = record[key];
      if (!Array.isArray(value)) continue;
      empty[key] = value
        .map(parseHistoryEntry)
        .filter((entry): entry is CheckHistoryEntry => entry !== null)
        .slice(0, HISTORY_LIMIT);
    }
    return empty;
  } catch {
    return empty;
  }
}

/** Persist history; storage may be unavailable, full, or blocked. */
export function saveHistory(history: CheckHistory): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // History is best-effort and must never break the status page.
  }
}

/** Prepend one result per check, keeping the newest HISTORY_LIMIT entries. */
export function appendHistory(
  history: CheckHistory,
  results: Record<CheckKey, StatusResult>,
  at: string,
): CheckHistory {
  const next = emptyHistory();
  for (const key of CHECK_KEYS) {
    next[key] = [{ state: results[key].state, at }, ...history[key]].slice(0, HISTORY_LIMIT);
  }
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons (inline SVG, aria-hidden — state is always conveyed by text too)
// ─────────────────────────────────────────────────────────────────────────────

function IconOk() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--ok)" />
      <path d="M6 10l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--warn)" />
      <path d="M10 6v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="14" r="1" fill="#fff" />
    </svg>
  );
}

function IconDown() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--bad)" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" className="status-spinner">
      <circle cx="10" cy="10" r="8" stroke="var(--border)" strokeWidth="3" />
      <path d="M10 2a8 8 0 018 8" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StateIcon({ state }: { state: CheckState | 'loading' }) {
  if (state === 'loading') return <IconSpinner />;
  if (state === 'operational') return <IconOk />;
  if (state === 'degraded') return <IconWarn />;
  return <IconDown />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label helpers
// ─────────────────────────────────────────────────────────────────────────────

export function stateLabel(state: CheckState | 'loading'): string {
  if (state === 'loading') return 'Checking…';
  if (state === 'operational') return 'Operational';
  if (state === 'degraded') return 'Degraded';
  return 'Down';
}

export function bannerLabel(state: CheckState): string {
  if (state === 'operational') return 'All systems operational';
  if (state === 'degraded') return 'Partial outage — some systems degraded';
  return 'Partial outage — one or more systems are down';
}

// ─────────────────────────────────────────────────────────────────────────────
// CheckRow — single component row
// ─────────────────────────────────────────────────────────────────────────────

interface CheckRowProps {
  label: string;
  state: CheckState | 'loading';
  result: StatusResult | null;
  history: CheckHistoryEntry[];
}

function CheckRow({ label, state, result, history }: CheckRowProps) {
  const [open, setOpen] = useState(false);
  const detailId = useId();

  return (
    <div className="status-row">
      <div className="status-row-main">
        <div className="status-row-icon">
          <StateIcon state={state} />
        </div>
        <div className="status-row-info">
          <span className="status-row-label">{label}</span>
          <span className={`status-row-state status-row-state--${state}`}>
            {stateLabel(state)}
          </span>
        </div>
        <div className="status-row-meta">
          {result && <span className="status-row-latency">{result.latencyMs}ms</span>}
          {result && (
            <button
              type="button"
              className="status-row-toggle"
              aria-expanded={open}
              aria-controls={detailId}
              aria-label={`${open ? 'Hide' : 'Show'} details for ${label}`}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Hide' : 'Details'}
            </button>
          )}
        </div>
      </div>
      {open && result && (
        <div id={detailId} className="status-row-detail" role="region" aria-label={`${label} details`}>
          <span>{result.detail}</span>
          {(result as ChainConfigResult).mismatch && (
            <span className="status-mismatch-badge">⚠ Config mismatch</span>
          )}
        </div>
      )}
      {history.length > 0 && (
        <div className="status-row-history" role="group" aria-label={`Recent ${label} checks`}>
          <span className="small muted">Recent:</span>
          <ol className="status-history-list">
            {history.map((entry, index) => (
              <li
                key={`${entry.at}-${index}`}
                className={`status-history-item status-history-item--${entry.state}`}
              >
                <span>{stateLabel(entry.state)}</span>
                <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
                  {new Date(entry.at).toLocaleTimeString()}
                </time>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main client component
// ─────────────────────────────────────────────────────────────────────────────

interface Checks {
  api: StatusResult | null;
  chain: ChainConfigResult | null;
  rpc: StatusResult | null;
  contract: StatusResult | null;
}

const EMPTY_CHECKS: Checks = { api: null, chain: null, rpc: null, contract: null };

export default function StatusClient() {
  const isOnline = useOnlineStatus();
  const [checks, setChecks] = useState<Checks>(EMPTY_CHECKS);
  const [history, setHistory] = useState<CheckHistory>(emptyHistory);
  const [running, setRunning] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const historyRef = useRef<CheckHistory>(emptyHistory());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const isOnlineRef = useRef(isOnline);
  const lastCheckedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  isOnlineRef.current = isOnline;

  const runChecks = useCallback(async () => {
    if (!isOnlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine) || inFlight.current) {
      return;
    }
    inFlight.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setRunning(true);
    setAnnouncement('Running status checks…');

    try {
      // Health and chain config first: the chain endpoint supplies the RPC URL.
      const [apiResult, chainResult] = await Promise.all([
        checkApi(controller.signal),
        checkChainConfig(controller.signal),
      ]);
      if (!mounted.current || controller.signal.aborted) return;
      setChecks((prev) => ({ ...prev, api: apiResult, chain: chainResult }));

      const rpcUrl = chainResult.rpcUrl || site.rpcUrl;
      const [rpcResult, contractResult] = await Promise.all([
        checkRpc(rpcUrl, controller.signal),
        checkContract(rpcUrl, controller.signal),
      ]);
      if (!mounted.current || controller.signal.aborted) return;

      const next: Checks = { api: apiResult, chain: chainResult, rpc: rpcResult, contract: contractResult };
      setChecks(next);
      lastCheckedAtRef.current = Date.now();
      setLastChecked(new Date());
      setAnnouncement(bannerLabel(aggregateState([apiResult, chainResult, rpcResult, contractResult])));

      // Record history only when a full check cycle finishes, never on render.
      const nextHistory = appendHistory(
        historyRef.current,
        { api: apiResult, chain: chainResult, rpc: rpcResult, contract: contractResult },
        new Date().toISOString(),
      );
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      saveHistory(nextHistory);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      inFlight.current = false;
      if (mounted.current) setRunning(false);
    }
  }, []);

  useEffect(() => {
    const stored = loadHistory();
    historyRef.current = stored;
    setHistory(stored);
  }, []);

  // Run on mount, every 30s while visible & online, and immediately when returning to a visible tab after the interval.
  useEffect(() => {
    mounted.current = true;
    if (isOnlineRef.current && document.visibilityState !== 'hidden') {
      runChecks();
    }

    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden' && isOnlineRef.current) {
        runChecks();
      }
    }, AUTO_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isOnlineRef.current) {
        const last = lastCheckedAtRef.current;
        if (last === null || Date.now() - last >= AUTO_REFRESH_MS) {
          runChecks();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted.current = false;
      abortControllerRef.current?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runChecks]);

  // Refresh when connectivity is restored if the tab is visible and data is missing or stale.
  useEffect(() => {
    if (isOnline && document.visibilityState !== 'hidden') {
      const last = lastCheckedAtRef.current;
      if (last === null || Date.now() - last >= AUTO_REFRESH_MS) {
        runChecks();
      }
    }
  }, [isOnline, runChecks]);

  const results = [checks.api, checks.chain, checks.rpc, checks.contract].filter(
    Boolean,
  ) as StatusResult[];
  const overall: CheckState | 'loading' = results.length < 4 ? 'loading' : aggregateState(results);
  const mismatch = checks.chain?.mismatch;

  return (
    <div className="container">
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="status-announcer">
        {announcement}
      </div>

      <div className="page-head">
        <h1>System Status</h1>
        <p>Live health of the TalentTrust API, Soroban RPC and escrow contract.</p>
      </div>

      <div
        className={`status-banner status-banner--${overall}`}
        data-testid="status-banner"
        aria-label="Overall system status"
      >
        <StateIcon state={overall} />
        <span>{overall === 'loading' ? 'Checking all systems…' : bannerLabel(overall)}</span>
      </div>

      {!isOnline && (
        <div className="alert alert-warning" role="status" data-testid="offline-notice">
          You are offline - results may be outdated
        </div>
      )}

      {mismatch && (
        <div className="alert alert-error" role="alert" data-testid="mismatch-alert">
          <strong>Configuration mismatch:</strong> {mismatch}
        </div>
      )}

      <section
        aria-labelledby="checks-heading"
        aria-live="polite"
        aria-busy={running}
        className="status-list"
        data-testid="status-checks"
      >
        <h2 id="checks-heading" className="sr-only">
          Individual component checks
        </h2>
        <CheckRow
          label="REST API (/health)"
          state={checks.api?.state ?? 'loading'}
          result={checks.api}
          history={history.api}
        />
        <CheckRow
          label="Chain Config (/api/v1/chain)"
          state={checks.chain?.state ?? 'loading'}
          result={checks.chain}
          history={history.chain}
        />
        <CheckRow
          label="Soroban RPC"
          state={checks.rpc?.state ?? 'loading'}
          result={checks.rpc}
          history={history.rpc}
        />
        <CheckRow
          label="Escrow Contract"
          state={checks.contract?.state ?? 'loading'}
          result={checks.contract}
          history={history.contract}
        />
      </section>

      <div className="status-controls">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={runChecks}
          disabled={running || !isOnline}
          aria-label="Re-run all status checks"
        >
          {running ? 'Checking…' : 'Re-run checks'}
        </button>
        {lastChecked && (
          <span className="small muted">
            Last checked:{' '}
            <time dateTime={lastChecked.toISOString()}>{lastChecked.toLocaleTimeString()}</time>
          </span>
        )}
      </div>
    </div>
  );
}
