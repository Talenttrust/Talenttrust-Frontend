'use client';

import React, { useEffect, useState, useCallback, useId } from 'react';
import { useWallet } from '@/components/wallet/WalletProvider';
import {
  getContract,
  buildDepositTx,
  buildReleaseTx,
  buildCancelTx,
  formatStroops,
  OnChainEscrow,
} from '@/lib/stellar/escrow';
import { simulateSignSubmit, TxStatus } from '@/lib/stellar/submit';
import { parseContractError } from '@/lib/stellar/errors';
import { explorerTxUrl } from '@/lib/stellar/config';

// ── Guard logic (pure, exported for tests) ───────────────────────────────────

export type ActionGuards = {
  canFund: boolean;
  canReleaseMilestone: (index: number) => boolean;
  canCancel: boolean;
};

export function computeGuards(
  escrow: OnChainEscrow | null,
  callerAddress: string | null
): ActionGuards {
  if (!escrow || !callerAddress) {
    return { canFund: false, canReleaseMilestone: () => false, canCancel: false };
  }
  const isClient =
    escrow.client.toLowerCase() === callerAddress.toLowerCase();
  const isCreated = escrow.status === 'Created';
  const isFunded = escrow.status === 'Funded';
  const isTerminal =
    escrow.status === 'Completed' ||
    escrow.status === 'Cancelled' ||
    escrow.status === 'Disputed';

  const remaining = escrow.totalAmount - escrow.fundedAmount;

  return {
    canFund: isClient && (isCreated || isFunded) && remaining > 0n && !isTerminal,
    canReleaseMilestone: (i: number) => {
      if (!isClient || !isFunded || isTerminal) return false;
      const ms = escrow.milestones[i];
      if (!ms || ms.released) return false;
      const available = escrow.fundedAmount - escrow.releasedAmount;
      return available >= ms.amount;
    },
    canCancel: isClient && (isCreated || isFunded) && !isTerminal,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TxStatus, string> = {
  idle: '',
  simulating: 'Simulating transaction…',
  awaiting_signature: 'Waiting for signature…',
  submitting: 'Submitting…',
  confirmed: 'Confirmed!',
  error: '',
};

function xlm(stroops: bigint): string {
  return `${formatStroops(stroops)} XLM`;
}

// ── TxProgress ────────────────────────────────────────────────────────────────

type TxProgressProps = { status: TxStatus; error: string | null; txHash: string | null };
function TxProgress({ status, error, txHash }: TxProgressProps) {
  if (status === 'idle') return null;
  if (status === 'error')
    return (
      <p role="alert" className="alert alert-error tx-progress small">
        {error ?? 'An error occurred.'}
      </p>
    );
  if (status === 'confirmed')
    return (
      <p role="status" className="alert tx-progress tx-progress-ok small">
        Confirmed!{' '}
        {txHash && (
          <a
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="alert-link"
          >
            View on Explorer
          </a>
        )}
      </p>
    );
  return (
    <p role="status" aria-live="polite" className="tx-progress small muted">
      {STATUS_LABELS[status]}
    </p>
  );
}

// ── CancelDialog ──────────────────────────────────────────────────────────────

type CancelDialogProps = {
  refundAmount: bigint;
  onConfirm: () => void;
  onDismiss: () => void;
  titleId: string;
};
function CancelDialog({ refundAmount, onConfirm, onDismiss, titleId }: CancelDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="onchain-dialog-backdrop"
    >
      <div className="confirm onchain-dialog">
        <div className="confirm-body">
          <h2 id={titleId} className="confirm-title">
            Cancel contract?
          </h2>
          <p className="confirm-description">
            This will cancel the contract and refund{' '}
            <strong aria-label={`${xlm(refundAmount)} will be refunded`}>
              {xlm(refundAmount)}
            </strong>{' '}
            to you.
          </p>
          <div className="confirm-actions">
            <button
              type="button"
              onClick={onConfirm}
              autoFocus
              className="btn btn-danger"
            >
              Confirm cancel
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="btn btn-secondary"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type OnChainEscrowActionsProps = { id: number };

export default function OnChainEscrowActions({ id }: OnChainEscrowActionsProps) {
  const { address } = useWallet();
  const [escrow, setEscrow] = useState<OnChainEscrow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [depositInput, setDepositInput] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const cancelTitleId = useId();
  const depositInputId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getContract(id);
      setEscrow(data);
      const remaining = data.totalAmount - data.fundedAmount;
      if (remaining > 0n) setDepositInput(formatStroops(remaining));
    } catch (err) {
      setLoadError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const guards = computeGuards(escrow, address ?? null);
  const isClient =
    escrow ? (address ?? '').toLowerCase() === escrow.client.toLowerCase() : false;

  const runTx = useCallback(
    async (buildFn: () => Promise<{ xdr: string; networkPassphrase: string }>) => {
      if (!address) return;
      setTxStatus('idle');
      setTxError(null);
      setTxHash(null);
      try {
        const { xdr } = await buildFn();
        const hash = await simulateSignSubmit(xdr, address, (s, detail) => {
          setTxStatus(s);
          if (s === 'confirmed' && detail) setTxHash(detail);
        });
        setTxHash(hash);
        setTxStatus('confirmed');
        await load();
      } catch (err) {
        setTxStatus('error');
        setTxError(parseContractError(err));
      }
    },
    [address, load]
  );

  const handleDeposit = () => {
    if (!address || !escrow) return;
    const xlmVal = parseFloat(depositInput);
    if (isNaN(xlmVal) || xlmVal <= 0) {
      setTxStatus('error');
      setTxError('Please enter a valid amount greater than 0.');
      return;
    }
    const stroops = BigInt(Math.round(xlmVal * 10_000_000));
    const remaining = escrow.totalAmount - escrow.fundedAmount;
    if (stroops > remaining) {
      setTxStatus('error');
      setTxError(`Amount exceeds remaining: ${xlm(remaining)}.`);
      return;
    }
    runTx(() => buildDepositTx(id, stroops, address));
  };

  const handleRelease = (index: number) => {
    if (!address) return;
    runTx(() => buildReleaseTx(id, index, address));
  };

  const handleCancelConfirm = () => {
    setShowCancel(false);
    if (!address) return;
    runTx(() => buildCancelTx(id, address));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading contract"
        className="card"
      >
        <p className="small muted">Loading contract…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="alert alert-error">
        <p className="small">{loadError}</p>
      </div>
    );
  }

  if (!escrow) return null;

  const remaining = escrow.totalAmount - escrow.fundedAmount;
  const refundAmount = escrow.fundedAmount - escrow.releasedAmount;
  const isBusy =
    txStatus === 'simulating' ||
    txStatus === 'awaiting_signature' ||
    txStatus === 'submitting';

  return (
    <>
      {showCancel && (
        <CancelDialog
          refundAmount={refundAmount}
          onConfirm={handleCancelConfirm}
          onDismiss={() => setShowCancel(false)}
          titleId={cancelTitleId}
        />
      )}

      <section
        aria-labelledby="onchain-actions-heading"
        className="card stack onchain-actions"
      >
        <div>
          <p className="onchain-eyebrow small muted">On-chain Actions</p>
          <h2
            id="onchain-actions-heading"
            className="onchain-heading"
          >
            Contract #{id}
          </h2>
          <dl className="onchain-meta small">
            <div>
              <dt className="muted">Status</dt>
              <dd>{escrow.status}</dd>
            </div>
            <div>
              <dt className="muted">Total</dt>
              <dd>{xlm(escrow.totalAmount)}</dd>
            </div>
            <div>
              <dt className="muted">Funded</dt>
              <dd>{xlm(escrow.fundedAmount)}</dd>
            </div>
            <div>
              <dt className="muted">Released</dt>
              <dd>{xlm(escrow.releasedAmount)}</dd>
            </div>
          </dl>
        </div>

        {/* Read-only note for non-client */}
        {!isClient && (
          <p className="notice small muted">
            Only the client can take actions on this contract. You are viewing in read-only mode.
          </p>
        )}

        {/* Fund section */}
        {guards.canFund && (
          <div className="onchain-section stack">
            <h3>Fund contract</h3>
            <p className="small muted">
              Remaining to fund: <strong>{xlm(remaining)}</strong>
            </p>
            <div className="row">
              <label htmlFor={depositInputId} className="sr-only">
                Amount in XLM
              </label>
              <input
                id={depositInputId}
                type="number"
                min="0"
                step="0.0000001"
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
                disabled={isBusy}
                placeholder="Amount in XLM"
                aria-label="Deposit amount in XLM"
                className="input"
              />
              <button
                type="button"
                onClick={handleDeposit}
                disabled={isBusy}
                aria-label="Fund contract"
                className="btn btn-primary"
              >
                Fund
              </button>
            </div>
          </div>
        )}

        {/* Milestones */}
        {escrow.milestones.length > 0 && (
          <div className="onchain-section stack">
            <h3>Milestones</h3>
            <ul className="onchain-milestones">
              {escrow.milestones.map((ms, i) => (
                <li
                  key={i}
                  className="onchain-milestone-item"
                >
                  <span className="onchain-milestone-label small">
                    {ms.title || `Milestone ${i + 1}`}{' '}
                    <span className="muted">— {xlm(ms.amount)}</span>
                    {ms.released && (
                      <span className="onchain-released">(released)</span>
                    )}
                  </span>
                  {guards.canReleaseMilestone(i) && (
                    <button
                      type="button"
                      onClick={() => handleRelease(i)}
                      disabled={isBusy}
                      aria-label={`Release milestone ${i + 1}: ${ms.title || ''} (${xlm(ms.amount)})`}
                      className="btn btn-secondary btn-sm"
                    >
                      Release
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cancel */}
        {guards.canCancel && (
          <div className="onchain-section">
            <button
              type="button"
              onClick={() => setShowCancel(true)}
              disabled={isBusy}
              aria-label="Cancel contract"
              className="btn btn-danger onchain-cancel-btn"
            >
              Cancel contract
            </button>
          </div>
        )}

        <TxProgress status={txStatus} error={txError} txHash={txHash} />
      </section>
    </>
  );
}
