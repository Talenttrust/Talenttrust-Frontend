'use client';

import { useWallet } from '@/contexts/WalletContext';

export type ActionPanelProps = {
  status: 'Active' | 'Completed' | 'Disputed' | 'Pending';
  onSubmitMilestone?: () => void;
  onDispute?: () => void;
  onReleaseFunds?: () => void;
  onViewSummary?: () => void;
};

const getActionButtons = (status: ActionPanelProps['status']) => {
  if (status === 'Active') {
    return ['Submit Milestone', 'Release Funds', 'Dispute'];
  }
  if (status === 'Pending') {
    return ['Release Funds', 'Dispute'];
  }
  if (status === 'Disputed') {
    return ['Dispute'];
  }
  return ['View Summary'];
};

const ActionPanel = ({
  status,
  onSubmitMilestone,
  onDispute,
  onReleaseFunds,
  onViewSummary,
}: ActionPanelProps) => {
  const actions = getActionButtons(status);
  const { address } = useWallet();
  const isWalletConnected = !!address;
  const noWalletMsg = 'Connect wallet to perform this action';

  const focusRingClass =
    'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

  return (
    <aside
      aria-labelledby="action-panel-heading"
      className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-6">
        <p className="text-sm text-slate-500 uppercase tracking-[0.24em]">Action Panel</p>
        <h2
          id="action-panel-heading"
          className="mt-2 text-xl font-semibold text-slate-900"
        >
          What would you like to do?
        </h2>
        {!isWalletConnected && (
          <p className="mt-2 text-sm text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">
            {noWalletMsg}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {actions.includes('Submit Milestone') && onSubmitMilestone && (
          <button
            type="button"
            onClick={onSubmitMilestone}
            disabled={!isWalletConnected}
            title={!isWalletConnected ? noWalletMsg : undefined}
            aria-label="Submit milestone for approval"
            className={`w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${focusRingClass}`}
          >
            Submit Milestone
          </button>
        )}

        {actions.includes('Release Funds') && onReleaseFunds && (
          <button
            type="button"
            onClick={onReleaseFunds}
            disabled={!isWalletConnected}
            title={!isWalletConnected ? noWalletMsg : undefined}
            aria-label="Release funds to the contractor"
            className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed ${focusRingClass}`}
          >
            Release Funds
          </button>
        )}

        {actions.includes('Dispute') && onDispute && (
          <button
            type="button"
            onClick={onDispute}
            disabled={!isWalletConnected}
            title={!isWalletConnected ? noWalletMsg : undefined}
            aria-label="Open a dispute for this contract"
            className={`w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed ${focusRingClass}`}
          >
            Dispute
          </button>
        )}

        {actions.includes('View Summary') && onViewSummary && (
          <button
            type="button"
            onClick={onViewSummary}
            aria-label="View contract summary details"
            className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 ${focusRingClass}`}
          >
            View Summary
          </button>
        )}
      </div>
    </aside>
  );
};

export default ActionPanel;
