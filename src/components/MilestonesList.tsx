import StatusBadge, { StatusType } from './StatusBadge';
import { usePreferences } from '@/lib/preferences';
import { findCurrencyMismatches, normalizeCurrencyCode } from '@/lib/currencyMismatch';

export type Milestone = {
  id: string;
  title: string;
  status: StatusType;
  payout: number;
  currency: string;
  dueDate?: string;
};

export type MilestonesListProps = {
  milestones: Milestone[];
  contractCurrency?: string;
};

const MilestonesList = ({ milestones, contractCurrency }: MilestonesListProps) => {
  const { formatAmount } = usePreferences();
  const mismatchedMilestoneIds = contractCurrency
    ? new Set(findCurrencyMismatches(contractCurrency, milestones))
    : new Set<string>();
  const mismatchedMilestones = milestones.filter((milestone) =>
    mismatchedMilestoneIds.has(milestone.id),
  );
  const mismatchCurrencies = Array.from(
    new Set(mismatchedMilestones.map((milestone) => normalizeCurrencyCode(milestone.currency))),
  ).sort();
  const normalizedContractCurrency = contractCurrency
    ? normalizeCurrencyCode(contractCurrency)
    : undefined;

  return (
    <section aria-labelledby="milestones-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 id="milestones-title" className="text-xl font-semibold text-slate-900">
          Milestones
        </h2>
        <span id="milestones-count" className="text-sm text-slate-500">{milestones.length} total</span>
      </div>

      {normalizedContractCurrency && mismatchedMilestones.length > 0 ? (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p className="font-semibold">
            {mismatchedMilestones.length}{' '}
            {mismatchedMilestones.length === 1 ? 'milestone uses' : 'milestones use'}{' '}
            {mismatchCurrencies.join(', ')} instead of {normalizedContractCurrency}.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {mismatchedMilestones.map((milestone) => (
              <li key={milestone.id}>
                {milestone.title}: {formatAmount(milestone.payout, milestone.currency)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        Keyboard Accessibility (WCAG 2.1.1):
        The scrollable container is focusable (tabIndex={0}) with role="region" so keyboard-only users
        can navigate to it and scroll with arrow keys.

        Labelling (WCAG 1.3.1 / 4.1.2):
        aria-labelledby references both the visible "Milestones" heading (milestones-title) and the live
        count span (milestones-count) so AT users hear e.g. "Milestones, 3 total – region" rather than
        a disconnected static string. This keeps the accessible name in sync with both the heading and
        the rendered item count without duplicating text.

        Why tabIndex is always applied when the list is populated:
        1. Consistency between SSR and client hydration avoids layout/hydration shifts.
        2. Testability in JSDOM where clientHeight/scrollHeight are always zero.
      */}
      <div
        role={milestones.length > 0 ? 'region' : undefined}
        aria-labelledby={milestones.length > 0 ? 'milestones-title milestones-count' : undefined}
        tabIndex={milestones.length > 0 ? 0 : undefined}
        className="mt-6 space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto pr-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
      >
        {milestones.map((milestone) => (
          <article
            key={milestone.id}
            className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">{milestone.title}</p>
                <p className="mt-1 text-sm text-slate-500">Due {milestone.dueDate ?? 'TBD'}</p>
              </div>
              <StatusBadge status={milestone.status} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
              <p>Payout</p>
              <p className="font-semibold text-slate-900">
                {formatAmount(milestone.payout, milestone.currency)}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default MilestonesList;
