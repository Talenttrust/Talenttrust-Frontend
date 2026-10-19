'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, EscrowContract } from '@/lib/api';
import { EscrowCard } from '@/components/escrow/EscrowCard';

export function EscrowDashboard() {
  const [contracts, setContracts] = useState<EscrowContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const [form, setForm] = useState({
    title: 'Website redesign',
    client: 'GCLIENT' + 'X'.repeat(49),
    freelancer: 'GFREELANCER' + 'Y'.repeat(45),
    milestones: 'Design: 300, Build: 700',
  });

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: EscrowContract[] }>('/api/v1/contracts');
      setContracts(res.data.sort((a, b) => b.id - a.id));
      setError(null);
    } catch (e) {
      setError(`Could not reach the API: ${(e as Error).message}`);
      setContracts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    id: number | 'new',
    pendingMessage: string,
    successMessage: string,
    fn: () => Promise<unknown>,
  ) => {
    setBusy(id);
    setError(null);
    setAnnouncement(pendingMessage);
    try {
      await fn();
      await load();
      setAnnouncement(successMessage);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setAnnouncement(`Error: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const milestones = form.milestones
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part, i) => {
        const [title, amount] = part.includes(':') ? part.split(':') : [`Milestone ${i + 1}`, part];
        return { title: title.trim(), amount: Number(amount) };
      });
    act('new', 'Creating escrow…', 'Escrow created', () =>
      api('/api/v1/contracts', {
        method: 'POST',
        body: { title: form.title, client: form.client, freelancer: form.freelancer, milestones },
      }),
    );
  };

  return (
    <div className="dash">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="escrow-live-announcer"
      >
        {announcement}
      </div>

      <section aria-labelledby="create-escrow-heading">
        <h2 id="create-escrow-heading" className="sr-only">
          Create escrow
        </h2>
        <form className="card form" onSubmit={create} aria-labelledby="new-escrow" aria-busy={busy === 'new'}>
          <h3 id="new-escrow">New escrow</h3>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="client">Client address</label>
            <input
              id="client"
              className="input mono"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="freelancer">Freelancer address</label>
            <input
              id="freelancer"
              className="input mono"
              value={form.freelancer}
              onChange={(e) => setForm({ ...form, freelancer: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="milestones">Milestones</label>
            <input
              id="milestones"
              className="input"
              value={form.milestones}
              onChange={(e) => setForm({ ...form, milestones: e.target.value })}
              required
            />
            <span className="small muted">Comma separated, as Title: amount</span>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy === 'new'} aria-busy={busy === 'new'}>
            {busy === 'new' ? 'Creating...' : 'Create escrow'}
          </button>
        </form>
      </section>

      <section className="stack" style={{ minWidth: 0 }} aria-labelledby="your-escrows-heading">
        <h2 id="your-escrows-heading" className="sr-only">
          Your escrows
        </h2>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {contracts === null && <div className="card muted" role="status">Loading escrows...</div>}
        {contracts?.length === 0 && !error && (
          <div className="card muted">No escrows yet. Create the first one.</div>
        )}
        {contracts?.map((c) => (
          <EscrowCard
            key={c.id}
            contract={c}
            busy={busy === c.id}
            onFund={(contract, amount) =>
              act(
                contract.id,
                `Funding escrow #${contract.id}…`,
                `Escrow #${contract.id} funded`,
                () =>
                  api(`/api/v1/contracts/${contract.id}/deposit`, {
                    method: 'POST',
                    body: { amount },
                  }),
              )
            }
            onReleaseNext={(contract, milestoneIndex) =>
              act(
                contract.id,
                'Releasing milestone…',
                'Milestone released',
                () =>
                  api(`/api/v1/contracts/${contract.id}/milestones/${milestoneIndex}/release`, {
                    method: 'POST',
                  }),
              )
            }
            onDispute={(contract) =>
              act(
                contract.id,
                'Submitting dispute…',
                'Dispute submitted',
                () =>
                  api(`/api/v1/contracts/${contract.id}/dispute`, {
                    method: 'POST',
                    body: { raisedBy: contract.client, reason: 'Raised from dashboard' },
                  }),
              )
            }
            onCancel={(contract) =>
              act(
                contract.id,
                'Cancelling escrow…',
                'Escrow cancelled',
                () =>
                  api(`/api/v1/contracts/${contract.id}/cancel`, {
                    method: 'POST',
                  }),
              )
            }
            onResolve={(contract) =>
              act(
                contract.id,
                'Resolving dispute…',
                'Dispute resolved',
                () =>
                  api(`/api/v1/contracts/${contract.id}/resolve`, {
                    method: 'POST',
                    body: { freelancerBps: 5000 },
                  }),
              )
            }
            onRate={(contract, rating) =>
              act(
                contract.id,
                'Submitting rating…',
                'Rating submitted',
                () =>
                  api(`/api/v1/contracts/${contract.id}/reputation`, {
                    method: 'POST',
                    body: { rating },
                  }),
              )
            }
          />
        ))}
      </section>
    </div>
  );
}
