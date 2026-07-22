export const MilestonesListSkeleton = () => {
  return (
    <section
      aria-labelledby="milestones-title"
      aria-busy="true"
      aria-label="Loading milestones"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="h-6 w-24 rounded-lg bg-slate-200" />
        <div className="h-4 w-12 rounded-lg bg-slate-200" />
      </div>

      <div className="mt-6 space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto pr-2">
        {[1, 2, 3].map((i) => (
          <article
            key={i}
            className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <div className="h-4 w-48 rounded-lg bg-slate-200" />
                <div className="mt-1 h-3 w-32 rounded-lg bg-slate-200" />
              </div>
              <div className="h-6 w-20 rounded-lg bg-slate-200" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
              <div className="h-4 w-16 rounded-lg bg-slate-200" />
              <div className="h-4 w-20 rounded-lg bg-slate-200" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
