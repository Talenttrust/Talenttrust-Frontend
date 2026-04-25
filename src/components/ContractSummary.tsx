import { truncateAddress } from '@/lib/truncateAddress';

export type ContractParty = {
  label: string;
  address: string;
};

export type ContractSummaryProps = {
  contractName: string;
  parties: ContractParty[];
  totalValue: number;
  currency: string;
  status: 'Active' | 'Completed' | 'Disputed' | 'Pending';
  createdAt: string;
  milestoneCount: number;
};

const statusStyles: Record<ContractSummaryProps['status'], string> = {
  Active: 'bg-emerald-100 text-emerald-800',
  Completed: 'bg-sky-100 text-sky-800',
  Disputed: 'bg-rose-100 text-rose-800',
  Pending: 'bg-amber-100 text-amber-800',
};

const ContractSummary = ({
  contractName,
  parties,
  totalValue,
  currency,
  status,
  createdAt,
  milestoneCount,
}: ContractSummaryProps) => {
  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(totalValue);

  return (
    <section
      aria-labelledby="contract-summary-title"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500 uppercase tracking-[0.24em]">Contract Summary</p>
          <h1 id="contract-summary-title" className="mt-2 text-2xl font-semibold text-slate-900">
            {contractName}
          </h1>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${statusStyles[status]}`}>
          {status}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Total value</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formattedValue}</p>
          <p className="text-sm text-slate-500">{milestoneCount} milestone{milestoneCount === 1 ? '' : 's'}</p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Created</p>
          <p className="mt-2 text-base font-medium text-slate-900">{createdAt}</p>
          <p className="mt-4 text-sm text-slate-500">Parties</p>
          <div className="mt-3 space-y-3">
            {parties.map((party) => (
              <div key={party.label} className="rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200">
                <p className="text-slate-600 font-medium">{party.label}</p>
                <p className="mt-1 text-slate-500">{truncateAddress(party.address)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContractSummary;
