'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, listContracts, type ApiError, type EscrowContract } from '@/lib/api';
import { useOptionalWallet } from '@/components/wallet/WalletProvider';
import { useIsArbiter } from '@/lib/stellar/useIsArbiter';
import { ResolveDisputeForm } from '@/components/disputes/ResolveDisputeForm';
import { useOptionalToast } from '@/components/toast/ToastProvider';

function disputeOpenedAt(contract: EscrowContract): string | undefined {
  return contract.dispute?.openedAt ?? contract.disputeOpenedAt ?? contract.disputedAt ?? undefined;
}

export function sortDisputesOldestFirst(contracts: EscrowContract[]): EscrowContract[] {
  return [...contracts].sort((a, b) => {
    const aTime = Date.parse(disputeOpenedAt(a) ?? '');
    const bTime = Date.parse(disputeOpenedAt(b) ?? '');
    const aValue = Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime;
    const bValue = Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime;
    return aValue - bValue;
  });
}

function ageLabel(openedAt?: string): string {
  if (!openedAt) return 'unknown';
  const opened = Date.parse(openedAt);
  if (Number.isNaN(opened)) return 'unknown';

  const seconds = Math.max(0, Math.floor((Date.now() - opened) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function heldAmount(contract: EscrowContract): number {
  return Math.max(0, contract.fundedAmount - contract.releasedAmount);
}

export function ArbiterConsole() {
  const isArbiter = useIsArbiter();
  const wallet = useOptionalWallet();
  const toast = useOptionalToast();
  const [contracts, setContracts] = useState<EscrowContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listContracts({ status: 'Disputed' });
      setContracts(sortDisputesOldestFirst(Array.isArray(result) ? result : []));
    } catch (cause) {
      const detail =
        cause instanceof Error ? (cause as ApiError).userMessage ?? cause.message : String(cause);
      setError(`Could not load disputes: ${detail}`);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isArbiter !== true) return;
    void load();
  }, [isArbiter, load]);

  if (isArbiter === null) {
    return (
      <section className="container page-head" aria-label="Arbiter console">
        <p role="status" className="small muted">
          Checking arbiter access…
        </p>
      </section>
    );
  }

  if (isArbiter === false) {
    return (
      <section className="container page-head" aria-label="Arbiter console">
        <h1>Arbiter console</h1>
        {wallet?.address ? (
          <div role="alert" className="alert alert-error" aria-live="polite">
            Not authorized. Only the contract arbiter can view and resolve disputes.
          </div>
        ) : (
          <div className="card stack">
            <h2>Connect your wallet</h2>
            <p>Connect the arbiter wallet to review open disputes.</p>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void wallet?.connect()}
              >
                Connect wallet
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const resolve = async (contract: EscrowContract, freelancerBps: number) => {
    setBusy(contract.id);
    try {
      await api(`/api/v1/contracts/${contract.id}/resolve`, {
        method: 'POST',
        body: { freelancerBps },
      });
      setContracts((previous) => previous.filter((item) => item.id !== contract.id));
      toast.success(`Escrow #${contract.id} resolved`);
    } catch (cause) {
      const detail =
        cause instanceof Error ? (cause as ApiError).userMessage ?? cause.message : String(cause);
      throw new Error(detail);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="container page-head" aria-label="Arbiter console">
      <h1>Arbiter console</h1>
      <p>Open disputes, oldest first. Review the claim and choose a payout split.</p>

      {loading && (
        <p role="status" className="small muted">
          Loading disputes…
        </p>
      )}

      {error && !loading && (
        <div role="alert" className="alert alert-error stack">
          <p className="small">{error}</p>
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {!loading && !error && contracts.length === 0 && (
        <p role="status" className="card">
          No open disputes.
        </p>
      )}

      <div className="stack" aria-busy={loading || busy !== null}>
        {contracts.map((contract) => {
          const openedAt = disputeOpenedAt(contract);
          const headingId = `arbiter-dispute-${contract.id}`;
          return (
            <article className="card stack" key={contract.id} aria-labelledby={headingId}>
              <div className="dispute-heading">
                <div>
                  <h2 id={headingId}>Escrow #{contract.id}: {contract.title}</h2>
                  <p className="small muted">
                    Raised by <span className="mono">{contract.dispute?.raisedBy ?? 'Unknown'}</span>
                    {' · Opened '}
                    {openedAt ? (
                      <time dateTime={openedAt}>{ageLabel(openedAt)}</time>
                    ) : (
                      <span>unknown</span>
                    )}
                  </p>
                </div>
                <span className="badge">Disputed</span>
              </div>
              <p>{contract.dispute?.reason ?? 'No reason provided.'}</p>
              <dl className="resolve-preview">
                <div>
                  <dt>Held</dt>
                  <dd>{heldAmount(contract).toLocaleString()} {contract.token}</dd>
                </div>
                <div>
                  <dt>Client</dt>
                  <dd><span className="mono">{contract.client}</span></dd>
                </div>
                <div>
                  <dt>Freelancer</dt>
                  <dd><span className="mono">{contract.freelancer}</span></dd>
                </div>
              </dl>
              <ResolveDisputeForm
                id={contract.id}
                held={heldAmount(contract)}
                token={contract.token}
                busy={busy === contract.id}
                onResolve={(freelancerBps) => resolve(contract, freelancerBps)}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
