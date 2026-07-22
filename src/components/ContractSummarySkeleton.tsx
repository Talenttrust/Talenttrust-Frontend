export const ContractSummarySkeleton = () => {
  return (
    <section
      aria-labelledby="contract-summary-title"
      aria-busy="true"
      aria-label="Loading contract summary"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500 uppercase tracking-[0.24em]">Contract Summary</p>
          <div className="mt-2 h-8 w-64 rounded-lg bg-slate-200" />
        </div>
        <div className="h-6 w-20 rounded-lg bg-slate-200" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Total value</p>
          <div className="mt-2 h-10 w-32 rounded-lg bg-slate-200" />
          <div className="mt-2 h-4 w-20 rounded-lg bg-slate-200" />
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Created</p>
          <div className="mt-2 h-6 w-40 rounded-lg bg-slate-200" />
          <p className="mt-4 text-sm text-slate-500">Parties</p>
          <div className="mt-3 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200">
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="mt-1 h-3 w-32 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
