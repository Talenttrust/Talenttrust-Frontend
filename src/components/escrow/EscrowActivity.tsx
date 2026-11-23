'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { site } from '@/lib/site';

type Status = 'loading' | 'ready' | 'error';

interface TimelineItem {
  key: string;
  sentence: string;
  ledger: number;
  closedAt: string;
  txHash: string;
}

interface EscrowActivityProps {
  escrowId: number;
}

function errorDetail(error: unknown): string {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  if (typeof status === 'number') return `The Stellar RPC responded with HTTP ${status}.`;
  if (error instanceof Error && error.message) return error.message;
  return 'The Stellar RPC could not be reached.';
}

export function EscrowActivity({ escrowId }: EscrowActivityProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;

    if (!Number.isSafeInteger(escrowId) || escrowId <= 0) {
      setError('Invalid escrow ID.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      // The SDK-backed events module is loaded lazily to keep it out of the
      // initial bundle for the rest of the app.
      const { fetchEscrowEvents, describeEvent } = await import('@/lib/stellar/events');
      const events = await fetchEscrowEvents(escrowId);
      if (!mounted.current || seq !== requestSeq.current) return;

      setItems(
        events.map((event) => ({
          key: event.key,
          sentence: describeEvent(event),
          ledger: event.ledger,
          closedAt: event.closedAt,
          txHash: event.txHash,
        })),
      );
      setStatus('ready');
    } catch (err) {
      if (!mounted.current || seq !== requestSeq.current) return;
      setError(errorDetail(err));
      setStatus('error');
    }
  }, [escrowId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requestSeq.current += 1;
    };
  }, [load]);

  return (
    <section className="stack" aria-labelledby="escrow-activity-heading">
      <h2 id="escrow-activity-heading" className="sr-only">
        On-chain activity for escrow #{escrowId}
      </h2>

      {status === 'loading' && (
        <div role="status" className="card muted">
          Loading on-chain activity…
        </div>
      )}

      {status === 'error' && (
        <div className="card activity-error" role="alert">
          <p>Couldn&apos;t load the activity for this escrow. {error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <p className="card muted" role="status">
          No on-chain activity for this escrow yet.
        </p>
      )}

      {status === 'ready' && items.length > 0 && (
        <ol className="activity-list" aria-labelledby="escrow-activity-heading">
          {items.map((item) => (
            <li key={item.key} className="activity-item">
              <p className="activity-sentence">{item.sentence}</p>
              <p className="activity-meta">
                <time dateTime={item.closedAt} title={new Date(item.closedAt).toLocaleString()}>
                  {item.closedAt}
                </time>
                <span aria-hidden="true"> · </span>
                <span className="mono">Ledger #{item.ledger}</span>
                <span aria-hidden="true"> · </span>
                <a
                  href={`https://stellar.expert/explorer/${site.network}/tx/${item.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View transaction ${item.txHash} for escrow #${escrowId} (opens in a new tab)`}
                >
                  View transaction
                </a>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
