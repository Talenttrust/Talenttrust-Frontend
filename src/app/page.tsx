export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4 sm:mb-6">
        TalentTrust
      </h1>
      <p className="text-center text-gray-600 max-w-sm sm:max-w-md mb-6 sm:mb-8 text-sm sm:text-base">
        Safe, secure payments that protect both freelancers and clients throughout your project.
      </p>
      <div className="max-w-sm sm:max-w-md text-left">
        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Key Terms</h2>
        <dl className="space-y-3 sm:space-y-2">
          <dt className="font-medium text-sm sm:text-base">Escrow</dt>
          <dd className="text-gray-600 text-sm sm:text-base">Money held safely until work is completed and approved.</dd>
          <dt className="font-medium text-sm sm:text-base">Milestone</dt>
          <dd className="text-gray-600 text-sm sm:text-base">A project checkpoint where payment is held until you approve the work.</dd>
          <dt className="font-medium text-sm sm:text-base">Release</dt>
          <dd className="text-gray-600 text-sm sm:text-base">When approved work is finished, the payment goes to the freelancer.</dd>
        </dl>
      </div>
    </main>
  );
}
