'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, Reputation } from '@/lib/api';
import { OnChainReputation, readOnChainReputation } from '@/lib/stellar/reputation';
import { normalizeAddress, validateAddress } from '@/lib/stellar/address';
import { site } from '@/lib/site';
import { addReputationLookup, loadReputationHistory } from '@/lib/reputationHistory';

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { name?: unknown }).name === 'AbortError') return true;
  return (error as { kind?: unknown }).kind === 'aborted';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortError(): Error {
  const error = new Error('The request was cancelled.');
  error.name = 'AbortError';
  return error;
}

/** Reject as soon as `signal` aborts, even if the underlying promise is still pending. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export function ReputationLookup() {
  const searchParams = useSearchParams();

  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [apiResult, setApiResult] = useState<Reputation | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [chainResult, setChainResult] = useState<OnChainReputation | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const initialised = useRef(false);

  const clearResults = useCallback(() => {
    setApiResult(null);
    setApiError(null);
    setChainResult(null);
    setChainError(null);
  }, []);

  const cancelPending = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestSeq.current += 1;
  }, []);

  const beginRequest = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    requestSeq.current += 1;
    return { controller, seq: requestSeq.current };
  }, []);

  const recordHistory = useCallback((value: string) => {
    setHistory((previous) => addReputationLookup(value, previous));
  }, []);

  const syncUrl = useCallback((value: string) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('address') === value) return;
    params.set('address', value);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    setHistory(loadReputationHistory());
  }, []);

  useEffect(
    () => () => {
      requestSeq.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const performLookup = useCallback(
    async (raw: string) => {
      const normalized = normalizeAddress(raw);
      setAddress(normalized);
      setAddressError(null);
      clearResults();

      const validation = validateAddress(normalized);
      if (!validation.ok) {
        cancelPending();
        setBusy(false);
        setAddressError(validation.message);
        return;
      }

      const value = validation.value;
      setAddress(value);
      syncUrl(value);

      const { controller, seq } = beginRequest();
      setBusy(true);

      const [apiSettled, chainSettled] = await Promise.allSettled([
        api<Reputation>(`/api/v1/reputation/${encodeURIComponent(value)}`, {
          signal: controller.signal,
        }),
        abortable(readOnChainReputation(value), controller.signal),
      ]);

      // A newer lookup (or an unmount) supersedes this one entirely.
      if (seq !== requestSeq.current) return;

      let succeeded = false;
      if (apiSettled.status === 'fulfilled') {
        setApiResult(apiSettled.value);
        succeeded = true;
      } else if (!isAbortError(apiSettled.reason)) {
        setApiError(errorMessage(apiSettled.reason));
      }

      if (chainSettled.status === 'fulfilled') {
        setChainResult(chainSettled.value);
        succeeded = true;
      } else if (!isAbortError(chainSettled.reason)) {
        setChainError(errorMessage(chainSettled.reason));
      }

      if (succeeded) recordHistory(value);
      if (seq === requestSeq.current) setBusy(false);
    },
    [beginRequest, cancelPending, clearResults, recordHistory, syncUrl],
  );

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const queryAddress = searchParams?.get('address');
    if (!queryAddress) return;

    const validation = validateAddress(queryAddress);
    if (validation.ok) void performLookup(validation.value);
  }, [performLookup, searchParams]);

  const lookup = (event: FormEvent) => {
    event.preventDefault();
    void performLookup(address);
  };

  const retryApi = useCallback(async () => {
    const value = normalizeAddress(address);
    const validation = validateAddress(value);
    if (!validation.ok) {
      setAddressError(validation.message);
      return;
    }

    const { controller, seq } = beginRequest();
    setApiError(null);
    setBusy(true);
    try {
      const result = await api<Reputation>(`/api/v1/reputation/${encodeURIComponent(value)}`, {
        signal: controller.signal,
      });
      if (seq !== requestSeq.current) return;
      setApiResult(result);
      recordHistory(value);
    } catch (error) {
      if (seq !== requestSeq.current || isAbortError(error)) return;
      setApiError(errorMessage(error));
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  }, [address, beginRequest, recordHistory]);

  const retryChain = useCallback(async () => {
    const value = normalizeAddress(address);
    const validation = validateAddress(value);
    if (!validation.ok) {
      setAddressError(validation.message);
      return;
    }

    const { controller, seq } = beginRequest();
    setChainError(null);
    setBusy(true);
    try {
      const result = await abortable(readOnChainReputation(value), controller.signal);
      if (seq !== requestSeq.current) return;
      setChainResult(result);
      recordHistory(value);
    } catch (error) {
      if (seq !== requestSeq.current || isAbortError(error)) return;
      setChainError(errorMessage(error));
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  }, [address, beginRequest, recordHistory]);

  const mismatch =
    apiResult &&
    chainResult &&
    (apiResult.averageRating !== chainResult.averageRating ||
      apiResult.completedContracts !== chainResult.completedContracts ||
      apiResult.totalRating !== chainResult.totalRating);

  const statRow = (label: string, value: React.ReactNode, id: string) => (
    <div key={id} className="stat-row">
      <dt id={id}>{label}</dt>
      <dd aria-labelledby={id}>{value}</dd>
    </div>
  );

  return (
    <div className="stack" style={{ maxWidth: 720, paddingBottom: 64 }}>
      <form className="card form" onSubmit={lookup}>
        <div className="field">
          <label htmlFor="address">Freelancer address</label>
          <div className="row">
            <input
              id="address"
              className="input mono"
              value={address}
              placeholder="Enter a Stellar public address (G...)"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setAddress(e.target.value);
                if (addressError) setAddressError(null);
              }}
              aria-invalid={addressError ? 'true' : 'false'}
              aria-describedby={addressError ? 'address-error' : undefined}
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Looking up...' : 'Look up'}
            </button>
          </div>
          {addressError && (
            <div id="address-error" role="alert" className="alert alert-error">
              {addressError}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="field">
            <span id="recent-lookups-label" className="small muted">
              Recent lookups
            </span>
            <ul
              aria-labelledby="recent-lookups-label"
              className="row"
              style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8, flexWrap: 'wrap' }}
            >
              {history.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm mono"
                    onClick={() => void performLookup(item)}
                    aria-label={`Look up ${item}`}
                    title={item}
                  >
                    {item.slice(0, 6)}…{item.slice(-4)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      {(apiResult || chainResult || apiError || chainError) && (
        <div className="results" role="region" aria-label="Reputation results" aria-live="polite">
          {mismatch && (
            <div className="notice notice-info" role="status">
              <strong>The values differ.</strong> The TalentTrust API is a demo mirror &mdash; its data lives in memory
              and can reset. The on-chain value recorded by the escrow contract on Stellar is authoritative.
            </div>
          )}
          <div className="grid grid-2">
            {chainResult || chainError ? (
              <div className="card">
                <h3 id="onchain-heading">On-chain (verified)</h3>
                <p className="small muted">Stellar {site.network} &middot; get_reputation</p>
                {chainError ? (
                  <>
                    <div className="alert alert-error">{chainError}</div>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={retryChain}
                      aria-label="Retry on-chain reputation check"
                    >
                      Retry on-chain
                    </button>
                  </>
                ) : (
                  chainResult && (
                    <>
                      <dl className="stats" aria-labelledby="onchain-heading">
                        {statRow('Completed contracts', chainResult.completedContracts, 'onchain-contracts')}
                        {statRow('Total rating points', chainResult.totalRating, 'onchain-total')}
                        {statRow(
                          'Average rating',
                          `${chainResult.averageRating.toFixed(2)} / 5`,
                          'onchain-average',
                        )}
                      </dl>
                      <p className="small" style={{ marginTop: 12 }}>
                        <a
                          href={`https://stellar.expert/explorer/${site.network}/account/${encodeURIComponent(
                            address.trim(),
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View account ${address.trim()} on stellar.expert (opens in a new tab)`}
                        >
                          View on stellar.expert
                        </a>
                      </p>
                    </>
                  )
                )}
              </div>
            ) : null}
            {apiResult || apiError ? (
              <div className="card">
                <h3 id="api-heading">TalentTrust API (demo)</h3>
                <p className="small muted">In-memory demo data; may reset.</p>
                {apiError ? (
                  <>
                    <div className="alert alert-error">{apiError}</div>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={retryApi}
                      aria-label="Retry API reputation check"
                    >
                      Retry API
                    </button>
                  </>
                ) : (
                  apiResult && (
                    <dl className="stats" aria-labelledby="api-heading">
                      {statRow('Completed contracts', apiResult.completedContracts, 'api-contracts')}
                      {statRow('Total rating points', apiResult.totalRating, 'api-total')}
                      {statRow('Average rating', `${(apiResult.averageRating ?? 0).toFixed(2)} / 5`, 'api-average')}
                    </dl>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
