import ReputationProfile from '../components/ReputationProfile';

const sampleReputation = {
  name: 'TalentTrust Profile',
  score: 82,
  level: 'Verified Contributor',
  history: [
    {
      id: 'evt-1',
      type: 'Reputation boost',
      summary: 'Completed successful milestone delivery',
      date: '2026-04-24',
    },
    {
      id: 'evt-2',
      type: 'On-chain review',
      summary: 'Received positive client trust signal',
      date: '2026-04-22',
    },
  ],
};

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-4xl font-bold text-slate-950">TalentTrust</h1>
          <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-600">
            Decentralized Freelancer Escrow Protocol on Stellar. Your reputation profile explains trust, shows history safely, and keeps sensitive metadata hidden by default.
          </p>
        </section>

        <ReputationProfile
          name={sampleReputation.name}
          score={sampleReputation.score}
          level={sampleReputation.level}
          history={sampleReputation.history}
        />
      </div>
    </main>
  );
}
