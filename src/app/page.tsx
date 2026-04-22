export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-center mb-4">
        TalentTrust
      </h1>
      <p className="text-center text-gray-600 max-w-md mb-8">
        Safe, secure payments that protect both freelancers and clients throughout your project.
      </p>
      <div className="max-w-md text-left">
        <h2 className="text-xl font-semibold mb-4">Key Terms</h2>
        <dl className="space-y-2">
          <dt className="font-medium">Escrow</dt>
          <dd className="text-gray-600">Money held safely until work is completed and approved.</dd>
          <dt className="font-medium">Milestone</dt>
          <dd className="text-gray-600">A project checkpoint where payment is held until you approve the work.</dd>
          <dt className="font-medium">Release</dt>
          <dd className="text-gray-600">When approved work is finished, the payment goes to the freelancer.</dd>
        </dl>
      </div>
    </main>
  );
}
