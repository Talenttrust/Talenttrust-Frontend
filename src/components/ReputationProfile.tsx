export type ReputationEvent = {
  id: string;
  type: string;
  summary: string;
  date: string;
};

export type ReputationProfileProps = {
  name: string;
  score?: number | null;
  level?: string;
  history?: ReputationEvent[];
};

const reputationSummary =
  'Reputation represents verified trust signals and activity history, not sensitive personal metadata. Privacy-friendly defaults keep your profile safe.';

export default function ReputationProfile({
  name,
  score,
  level = 'Community Member',
  history = [],
}: ReputationProfileProps) {
  const hasReputation = typeof score === 'number' && score >= 0;
  const showPartial = hasReputation && history.length === 0;

  return (
    <section className="w-full max-w-5xl mx-auto space-y-8 px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="profile-heading">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="sr-only" id="profile-heading">Reputation profile for {name}</h2>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-2xl font-semibold text-white">
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Reputation profile</p>
              <h1 className="text-2xl font-semibold text-slate-950">{name}</h1>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-3xl bg-slate-50 p-4 text-slate-700 sm:p-5">
            <p className="text-sm font-medium text-slate-500">Privacy-friendly defaults</p>
            <p className="text-sm leading-6">Only summary trust signals are shown by default. Sensitive metadata remains hidden.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500" id="reputation-score-label">Reputation score</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950" aria-labelledby="reputation-score-label">
              {hasReputation ? (
                <>
                  <span className="sr-only">Reputation score </span>{score}<span className="sr-only"> out of 5</span>
                </>
              ) : 'No reputation yet'}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500" id="reputation-level-label">Level</p>
            <p className="mt-3 text-xl font-semibold text-slate-950" aria-labelledby="reputation-level-label">
              {hasReputation ? (
                <>
                  <span className="sr-only">Level </span>{level}
                </>
              ) : 'Pending'}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Explanation</p>
            <p className="mt-3 text-sm leading-6 text-slate-700">{reputationSummary}</p>
          </div>
        </div>

        {showPartial && (
          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-semibold">Partial reputation data</p>
            <p className="mt-1 text-sm leading-6">
              A score exists but history is currently hidden until verified actions are available. This keeps your profile safe and private.
            </p>
          </div>
        )}
      </div>

      {/**
       * Reputation history section.
       *
       * Semantic notes:
       * - Uses `<ol>` (ordered list) because reputation history is inherently
       *   chronological — the order of events is meaningful.
       * - Each event date is wrapped in a `<time>` element whose `dateTime`
       *   attribute carries a machine-readable ISO-8601 value, improving
       *   assistive-technology support and SEO date parsing.
       * - When the date string is not a valid ISO date the `dateTime` attribute
       *   is omitted, keeping the markup valid.
       */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Reputation history</h2>
            <p className="mt-1 text-sm text-slate-500">
              History is shown as safe, aggregated events with no wallet or personal metadata by default.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
            {history.length ? 'Visible' : 'Private by default'}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
            <p className="font-semibold text-slate-900">No reputation history available yet.</p>
            <p className="mt-2 text-sm leading-6">
              Reputation history appears once you complete verified actions. Your profile remains safe and privacy-friendly until then.
            </p>
          </div>
        ) : (
          <ol className="space-y-4">
            {history.map((event) => {
              // Determine whether the date string is a parseable ISO date.
              // If it is, expose the ISO value via dateTime for machine readability.
              const isValidDate = event.date && !Number.isNaN(Date.parse(event.date));
              return (
                <li key={event.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">{event.type}</p>
                      <p className="mt-1 text-base font-semibold text-slate-950">{event.summary}</p>
                    </div>
                    <time
                      className="text-sm text-slate-500"
                      {...(isValidDate ? { dateTime: event.date } : {})}
                    >
                      {event.date}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
