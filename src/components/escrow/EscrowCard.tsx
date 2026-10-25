'use client';

import type { ReactNode } from 'react';
import type { EscrowContract } from '@/lib/api';

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

export interface EscrowCardProps {
  contract: EscrowContract;
  busy?: boolean;
  /** Extra controls rendered next to the status badge (e.g. a watch toggle). */
  headerActions?: ReactNode;
  onFund?: (contract: EscrowContract, amount: number) => void;
  onReleaseNext?: (contract: EscrowContract, milestoneIndex: number) => void;
  onDispute?: (contract: EscrowContract, trigger: HTMLButtonElement) => void;
  onCancel?: (contract: EscrowContract) => void;
  onResolve?: (contract: EscrowContract) => void;
  onRate?: (contract: EscrowContract, rating: number) => void;
}

export function EscrowCard({
  contract,
  busy = false,
  headerActions,
  onFund,
  onReleaseNext,
  onDispute,
  onCancel,
  onResolve,
  onRate,
}: EscrowCardProps) {
  const next = contract.milestones.find((m) => !m.released);
  const active = contract.status === 'Created' || contract.status === 'Funded';
  const pct = contract.totalAmount
    ? Math.min(100, Math.max(0, Math.round((contract.releasedAmount / contract.totalAmount) * 100)))
    : 0;
  const progressValueText = `${contract.releasedAmount} of ${contract.totalAmount} ${contract.token} released`;
  const headingId = `escrow-heading-${contract.id}`;

  return (
    <article className="card" aria-busy={busy}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 id={headingId} style={{ margin: 0 }}>
          #{contract.id} {contract.title}
        </h3>
        <div className="row" style={{ gap: 8 }}>
          {headerActions}
          <span className={`badge badge-${contract.status}`}>{contract.status}</span>
        </div>
      </div>

      <p className="small muted" style={{ margin: '6px 0 12px' }}>
        Client <span className="mono">{short(contract.client)}</span>{' '}
        <span aria-hidden="true">&rarr; Freelancer </span>
        <span className="sr-only">pays freelancer </span>
        <span className="mono">{short(contract.freelancer)}</span>
      </p>

      <div
        className="progress"
        role="progressbar"
        aria-label={`Escrow #${contract.id} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={progressValueText}
      >
        <span style={{ width: `${pct}%` }} />
      </div>

      <p className="small muted" style={{ margin: '8px 0 0' }}>
        Released {contract.releasedAmount} / {contract.totalAmount} {contract.token} &middot; In escrow{' '}
        {contract.fundedAmount - contract.releasedAmount} {contract.token}
      </p>

      <ul className="milestones" aria-label={`Milestones for escrow #${contract.id}`}>
        {contract.milestones.map((m) => (
          <li key={m.index}>
            <span className="truncate">
              <span className="sr-only">{m.released ? 'Completed milestone: ' : 'Pending milestone: '}</span>
              <span aria-hidden="true">{m.released ? '[x]' : '[ ]'} </span>
              {m.title}
            </span>
            <span className="mono">
              {m.amount} {contract.token}
            </span>
          </li>
        ))}
      </ul>

      <div className="row">
        {active && contract.fundedAmount < contract.totalAmount && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            aria-label={`Fund ${contract.totalAmount - contract.fundedAmount} ${contract.token} for escrow #${contract.id} ${contract.title}`}
            aria-describedby={headingId}
            onClick={() => onFund?.(contract, contract.totalAmount - contract.fundedAmount)}
          >
            Fund {contract.totalAmount - contract.fundedAmount} {contract.token}
          </button>
        )}
        {active && next && contract.fundedAmount - contract.releasedAmount >= next.amount && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            aria-label={`Release next milestone for escrow #${contract.id} ${contract.title}`}
            aria-describedby={headingId}
            onClick={() => onReleaseNext?.(contract, next.index)}
          >
            Release next
          </button>
        )}
        {active && (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              aria-label={`Dispute escrow #${contract.id} ${contract.title}`}
              aria-describedby={headingId}
              onClick={(event) => onDispute?.(contract, event.currentTarget)}
            >
              Dispute
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              aria-label={`Cancel escrow #${contract.id} ${contract.title}`}
              aria-describedby={headingId}
              onClick={() => onCancel?.(contract)}
            >
              Cancel
            </button>
          </>
        )}
        {contract.status === 'Disputed' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            aria-label={`Resolve 50/50 for escrow #${contract.id} ${contract.title}`}
            aria-describedby={headingId}
            onClick={() => onResolve?.(contract)}
          >
            Resolve 50/50
          </button>
        )}
        {contract.status === 'Completed' && !contract.reputationIssued && (
          <>
            <span className="small muted">Rate freelancer:</span>
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                aria-label={`Rate freelancer ${r} out of 5 stars for escrow #${contract.id} ${contract.title}`}
                aria-describedby={headingId}
                onClick={() => onRate?.(contract, r)}
              >
                {r}
              </button>
            ))}
          </>
        )}
        {contract.status === 'Completed' && contract.reputationIssued && (
          <span className="small muted">Rated. Thanks!</span>
        )}
      </div>
    </article>
  );
}
