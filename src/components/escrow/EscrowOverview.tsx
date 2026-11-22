'use client';

import Link from 'next/link';
import { CopyButton } from '@/components/CopyButton';
import { MilestoneTimeline } from '@/components/milestones/MilestoneTimeline';
import { Skeleton } from '@/components/ui/Skeleton';
import { WatchToggle } from '@/components/WatchToggle';
import { useContract } from '@/hooks/useContracts';
import type { EscrowContract } from '@/lib/api';

function percentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function Progress({ contract, label, value }: { contract: EscrowContract; label: string; value: number }) {
  const percent = percentage(value, contract.totalAmount);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>{label}</span>
        <strong>
          {value} / {contract.totalAmount} {contract.token} ({percent}%)
        </strong>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label={`${label} for escrow #${contract.id}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${value} of ${contract.totalAmount} ${contract.token} (${percent}%)`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function OverviewLoading() {
  return (
    <div className="container" role="status" aria-live="polite">
      <span className="sr-only">Loading escrow…</span>
      <div className="page-head">
        <Skeleton variant="block" width="min(420px, 70%)" height={40} radius={10} />
        <div style={{ marginTop: 12 }}>
          <Skeleton width="min(280px, 60%)" />
        </div>
      </div>
      <div className="card stack">
        <Skeleton width="30%" />
        <Skeleton variant="block" width="100%" height={12} radius={999} />
        <Skeleton width="45%" />
        <Skeleton variant="block" width="100%" height={12} radius={999} />
        <Skeleton variant="block" width="100%" height={180} />
      </div>
    </div>
  );
}

export function EscrowOverview({ id }: { id: number }) {
  const { contract, error, isLoading, isValidating, mutate } = useContract(id);

  if (isLoading || (!contract && !error)) return <OverviewLoading />;

  if (error?.status === 404) {
    return (
      <div className="container">
        <div className="page-head">
          <h1>Escrow not found</h1>
          <p>This escrow may have been removed or the link may be incorrect.</p>
        </div>
        <Link href="/contracts" className="btn btn-primary">
          Back to escrows
        </Link>
      </div>
    );
  }

  if (error && !contract) {
    return (
      <div className="container">
        <div className="page-head">
          <h1>Could not load escrow</h1>
          <p role="alert">{error.userMessage || error.message}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => void mutate()} disabled={isValidating}>
            {isValidating ? 'Retrying…' : 'Retry'}
          </button>
          <Link href="/contracts" className="btn btn-secondary">
            Back to escrows
          </Link>
        </div>
      </div>
    );
  }

  if (!contract) return <OverviewLoading />;

  const disputeOpened = formatDate(contract.dispute?.openedAt ?? contract.disputeOpenedAt ?? contract.disputedAt);
  const disputeResolved = formatDate(contract.dispute?.resolvedAt ?? undefined);

  return (
    <div className="container">
      <div className="page-head">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p className="eyebrow">Escrow #{contract.id}</p>
            <h1>{contract.title}</h1>
            <p>
              <span className={`badge badge-${contract.status}`}>{contract.status}</span>
            </p>
          </div>
          <WatchToggle contract={contract} />
        </div>
      </div>

      <section className="card stack" aria-labelledby="escrow-progress-heading">
        <h2 id="escrow-progress-heading">Payment progress</h2>
        <Progress contract={contract} label="Funded" value={contract.fundedAmount} />
        <Progress contract={contract} label="Released" value={contract.releasedAmount} />
      </section>

      <section className="card" aria-labelledby="escrow-parties-heading" style={{ marginTop: 16 }}>
        <h2 id="escrow-parties-heading">Parties</h2>
        <dl className="kv">
          <dt>Client</dt>
          <dd className="mono">
            {contract.client} <CopyButton value={contract.client} label="Copy client address" />
          </dd>
          <dt>Freelancer</dt>
          <dd className="mono">
            {contract.freelancer} <CopyButton value={contract.freelancer} label="Copy freelancer address" />
          </dd>
        </dl>
      </section>

      <section className="card" aria-label="Escrow milestones" style={{ marginTop: 16 }}>
        <MilestoneTimeline contract={contract} onRelease={() => {}} readOnly />
      </section>

      {contract.dispute && (
        <section className="card stack" aria-labelledby="escrow-dispute-heading" style={{ marginTop: 16 }}>
          <h2 id="escrow-dispute-heading">Dispute details</h2>
          <dl className="kv">
            <dt>Raised by</dt>
            <dd className="mono">
              {contract.dispute.raisedBy}{' '}
              <CopyButton value={contract.dispute.raisedBy} label="Copy dispute raiser address" />
            </dd>
            {disputeOpened && (
              <>
                <dt>Opened</dt>
                <dd>{disputeOpened}</dd>
              </>
            )}
            {disputeResolved && (
              <>
                <dt>Resolved</dt>
                <dd>{disputeResolved}</dd>
              </>
            )}
            {contract.dispute.freelancerBps != null && (
              <>
                <dt>Freelancer share</dt>
                <dd>{contract.dispute.freelancerBps / 100}%</dd>
              </>
            )}
          </dl>
          <p>{contract.dispute.reason}</p>
        </section>
      )}

      <nav className="actions" aria-label="Escrow documents" style={{ marginTop: 20 }}>
        <Link href={`/contracts/${contract.id}/statement`} className="btn btn-secondary">
          View statement
        </Link>
        <Link href={`/contracts/onchain/${contract.id}`} className="btn btn-secondary">
          On-chain actions
        </Link>
        <Link href="/contracts" className="btn btn-secondary">
          Back to escrows
        </Link>
      </nav>
    </div>
  );
}
