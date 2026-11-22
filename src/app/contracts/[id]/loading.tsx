import { Skeleton } from '@/components/ui/Skeleton';

export default function ContractLoading() {
  return (
    <div className="container" role="status" aria-live="polite">
      <span className="sr-only">Loading escrow…</span>
      <div className="page-head">
        <Skeleton variant="block" width="min(420px, 70%)" height={40} radius={10} />
        <div style={{ marginTop: 12 }}>
          <Skeleton width="min(280px, 60%)" />
        </div>
      </div>
      <div className="stack">
        {[0, 1, 2].map((section) => (
          <div className="card stack" key={section}>
            <Skeleton width="30%" height="1.2em" />
            <Skeleton variant="block" width="100%" height={section === 2 ? 180 : 12} radius={section === 2 ? 10 : 999} />
            {section !== 2 && <Skeleton width="55%" />}
          </div>
        ))}
      </div>
    </div>
  );
}
