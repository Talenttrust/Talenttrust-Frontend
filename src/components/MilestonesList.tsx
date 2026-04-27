export type Milestone = {
  id: string;
  title: string;
  status: 'Pending' | 'Completed' | 'Paid' | 'Disputed';
  payout: number;
  currency: string;
  dueDate?: string;
};

export type MilestonesListProps = {
  milestones: Milestone[];
};

const statusColors: Record<Milestone['status'], string> = {
  Pending: 'bg-amber-100 text-amber-800',
  Completed: 'bg-sky-100 text-sky-800',
  Paid: 'bg-emerald-100 text-emerald-800',
  Disputed: 'bg-rose-100 text-rose-800',
};

import { usePreferences } from '@/lib/preferences';

const MilestonesList = ({ milestones }: MilestonesListProps) => {
  const { formatAmount } = usePreferences();
  return (
    <section aria-labelledby="milestones-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 id="milestones-title" className="text-xl font-semibold text-slate-900">
          Milestones
        </h2>
        <span className="text-sm text-slate-500">{milestones.length} total</span>
      </div>

      <div className="mt-6 space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto pr-2">
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
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${statusColors[milestone.status]}`}>
                {milestone.status}
              </span>
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
