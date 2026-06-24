'use client';

import React, { useState, useRef } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { ConfirmDialog } from './ConfirmDialog';

export type ActionPanelDisabledReasons = {
  submitMilestone?: string;
  releaseFunds?: string;
  dispute?: string;
  viewSummary?: string;
};

export type ActionPanelProps = {
  status: 'Active' | 'Completed' | 'Disputed' | 'Pending';
  onSubmitMilestone?: () => void;
  onDispute?: () => void;
  onReleaseFunds?: () => void;
  onViewSummary?: () => void;
  /** Disable every action button and announce a loading reason to AT users. */
  isLoading?: boolean;
  /** Render a role="alert" region above the actions when something went wrong. */
  errorMessage?: string;
  /** Per-action accessible reason for why a button is currently disabled. */
  disabledReasons?: ActionPanelDisabledReasons;
};

const LOADING_REASON = 'Action is disabled while contract data is loading.';
const LOADING_DESCRIPTION_ID = 'action-panel-loading-reason';

const getActionButtons = (status: ActionPanelProps['status']) => {
  if (status === 'Active') return ['Submit Milestone', 'Release Funds', 'Dispute'];
  if (status === 'Pending') return ['Release Funds', 'Dispute'];
  if (status === 'Disputed') return ['Dispute'];
  return ['View Summary'];
};

const ActionPanel = ({
  status,
  onSubmitMilestone,
  onDispute,
  onReleaseFunds,
  onViewSummary,
  isLoading = false,
  errorMessage,
  disabledReasons,
}: ActionPanelProps) => {
  const actions = getActionButtons(status);
  const { address } = useWallet();
  const isWalletConnected = !!address;
  const noWalletMsg = 'Connect wallet to perform this action';

  const describedBy = (perActionId: string | undefined) =>
    isLoading ? LOADING_DESCRIPTION_ID : perActionId;
  const describedById = (key: keyof ActionPanelDisabledReasons) =>
    disabledReasons?.[key] ? `action-panel-${key}-reason` : undefined;

  const focusRingClass =
    'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<'release' | 'dispute' | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenConfirm = (action: 'release' | 'dispute') => {
    setConfirmAction(action);
  };

  const handleConfirm = () => {
    if (confirmAction === 'release') onReleaseFunds?.();
    else if (confirmAction === 'dispute') onDispute?.();
    setConfirmAction(null);
  };

  const handleCancel = () => {
    setConfirmAction(null);
  };

  return (
    <aside
      aria-labelledby="action-panel-heading"
      className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-6">
        <p className="text-sm text-slate-500 uppercase tracking-[0.24em]">Action Panel</p>
        <h2 id="action-panel-heading" className="mt-2 text-xl font-semibold text-slate-900">
          What would you like to do?
        </h2>
        {!isWalletConnected && (
          <p className="mt-2 text-sm text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">
            {noWalletMsg}
          </p>
        )}
        {errorMessage && (
          <p role="alert" className="mt-2 text-sm text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
            {errorMessage}
          </p>
        )}
        {isLoading && (
          <span id={LOADING_DESCRIPTION_ID} className="sr-only">
            {LOADING_REASON}
          </span>
        )}
        {disabledReasons?.submitMilestone && (
          <span id="action-panel-submitMilestone-reason" className="sr-only">
            {disabledReasons.submitMilestone}
          </span>
        )}
        {disabledReasons?.releaseFunds && (
          <span id="action-panel-releaseFunds-reason" className="sr-only">
            {disabledReasons.releaseFunds}
          </span>
        )}
        {disabledReasons?.dispute && (
          <span id="action-panel-dispute-reason" className="sr-only">
            {disabledReasons.dispute}
          </span>
        )}
        {disabledReasons?.viewSummary && (
          <span id="action-panel-viewSummary-reason" className="sr-only">
            {disabledReasons.viewSummary}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {actions.includes('Submit Milestone') && (
          <button
            type="button"
            onClick={() => onSubmitMilestone?.()}
            disabled={!isWalletConnected || isLoading || !!disabledReasons?.submitMilestone}
            title={!isWalletConnected ? noWalletMsg : undefined}
            aria-label="Submit milestone for approval"
            aria-describedby={describedBy(describedById('submitMilestone'))}
            className={`w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${focusRingClass}`}
          >
            Submit Milestone
          </button>
        )}

        {actions.includes('Release Funds') && (
          <button
            type="button"
            ref={el => { triggerButtonRef.current = el; }}
            onClick={e => handleOpenConfirm('release', e.currentTarget)}
            disabled={!isWalletConnected || isLoading || !!disabledReasons?.releaseFunds}
            title={!isWalletConnected ? noWalletMsg : undefined}
            aria-label="Release funds to the contractor"
            aria-describedby={describedBy(describedById('releaseFunds'))}
            className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed ${focusRingClass}`}
          >
            Release Funds
          </button>
        )}

        {actions.includes('Dispute') && (
          <button
            type="button"
            ref={el => { triggerButtonRef.current = el; }}
            onClick={e => handleOpenConfirm('dispute', e.currentTarget)}
            disabled={!isWalletConnected || isLoading || !!disabledReasons?.dispute}
            title={!isWalletConnected ? noWalletMsg : undefined}
            aria-label="Open a dispute for this contract"
            aria-describedby={describedBy(describedById('dispute'))}
            className={`w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed ${focusRingClass}`}
          >
            Dispute
          </button>
        )}

        {actions.includes('View Summary') && (
          <button
            type="button"
            onClick={() => onViewSummary?.()}
            disabled={isLoading || !!disabledReasons?.viewSummary}
            aria-label="View contract summary details"
            aria-describedby={describedBy(describedById('viewSummary'))}
            className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed ${focusRingClass}`}
          >
            View Summary
          </button>
        )}
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmAction !== null}
        title={confirmAction === 'release' ? 'Confirm Release Funds' : confirmAction === 'dispute' ? 'Confirm Dispute' : ''}
        description={confirmAction === 'release' ? 'Are you sure you want to release funds? This action cannot be undone.' : confirmAction === 'dispute' ? 'Are you sure you want to open a dispute? This action cannot be undone.' : ''}
        confirmLabel={confirmAction === 'release' ? 'Release Funds' : confirmAction === 'dispute' ? 'Dispute' : 'Confirm'}
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </aside>
  );
};

export default ActionPanel;
