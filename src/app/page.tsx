export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-center mb-4">
        TalentTrust
      </h1>
      <p className="text-center text-gray-600 max-w-md mb-8">
        Secure payments for freelancers and clients using blockchain technology.
      </p>
      <div className="max-w-md text-left">
        <h2 className="text-xl font-semibold mb-4">Glossary</h2>
        <dl className="space-y-2">
          <dt className="font-medium">Escrow</dt>
          <dd className="text-gray-600">Funds held securely by a third party until work is completed and approved.</dd>
          <dt className="font-medium">Milestone</dt>
          <dd className="text-gray-600">A defined stage or deliverable in a project, often tied to payment release.</dd>
          <dt className="font-medium">Release</dt>
          <dd className="text-gray-600">The process of transferring escrowed funds to the freelancer upon approval.</dd>
        </dl>
      </div>
    </main>
  );
}
