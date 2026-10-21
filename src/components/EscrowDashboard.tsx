'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, EscrowContract, ViewFilter, listContracts } from '@/lib/api';
import { getAddress } from '@/lib/stellar/freighter';
import { ViewFilterControl } from './ViewFilterControl';
import { RoleChip } from './RoleChip';

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

/** Coerce any string from the URL into a valid ViewFilter, defaulting to 'all'. */
function toViewFilter(raw: string | null): ViewFilter {
  if (raw === 'client' || raw === 'freelancer') return raw;
  return 'all';
}

export function EscrowDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── wallet ──────────────────────────────────────────────────────────────────
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  useEffect(() => {
    getAddress().then(setWalletAddress).catch(() => setWalletAddress(null));
  }, []);

  // ── view filter (URL-persisted) ──────────────────────────────────────────
  const view = toViewFilter(searchParams.get('view'));

  const handleViewChange = useCallback(
    (next: ViewFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') {
        params.delete('view');
      } else {
        params.set('view', next);
      }
      router.replace(`/contracts${params.toString() ? `?${params.toString()}` : ''}`);
    },
    [router, searchParams],
  );

  // ── contract list ────────────────────────────────────────────────────────
  const [contracts, setContracts] = useState<EscrowContract[] | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [busy, setBusy] = useState<number | 'new' | null>(null);

  const loadController = useRef<AbortController | null>(null);
  const latestView = useRef(view);
  latestView.current = view;

  // Status is filtered by the API, the rest is done client-side
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;

    // When a wallet-role view is selected, pass ?party= so the backend
    // pre-filters. Client-side we then tighten by exact role match.
    const party =
      view !== 'all' && walletAddress ? walletAddress : undefined;

    try {
      const data = await listContracts({ party });

      // If the view changed while this fetch was in-flight, discard.
      if (latestView.current !== view) return;
      if (controller.signal.aborted) return;

      // Client-side tighten: party matches either role; we keep only the one
      // matching the selected view.
      const filtered =
        view === 'all' || !walletAddress
          ? data
          : data.filter((c) =>
              view === 'client'
                ? c.client === walletAddress
                : c.freelancer === walletAddress,
            );

      setContracts(filtered.sort((a, b) => b.id - a.id));
      setError(null);
    } catch (e) {
      if (latestView.current !== view) return;
      if (e instanceof ApiError && e.kind === 'aborted') return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      setError({ message: e instanceof ApiError ? e.userMessage : `Could not reach the API: ${detail}`, detail });
      setContracts([]);
    }
  }, [view, walletAddress]);

  useEffect(() => {
    // Reset the list on every view/wallet change so we never flash stale data.
    setContracts(null);
    load();
    return () => loadController.current?.abort();
  }, [load]);

  const act = async (id: number | 'new', fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'aborted') return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      setError({ message: e instanceof ApiError ? e.userMessage : detail, detail });
    } finally {
      setBusy(null);
    }
  };

  // ── form ──────────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    title: 'Website redesign',
    client: 'GCLIENT' + 'X'.repeat(49),
    freelancer: 'GFREELANCER' + 'Y'.repeat(45),
    milestones: 'Design: 300, Build: 700',
  });

  const create = (e: FormEvent) => {
    e.preventDefault();
    const milestones = form.milestones
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part, i) => {
        const [title, amount] = part.includes(':')
          ? part.split(':')
          : [`Milestone ${i + 1}`, part];
        return { title: title.trim(), amount: Number(amount) };
      });
    act('new', () =>
      api('/api/v1/contracts', {
        method: 'POST',
        body: {
          title: form.title,
          client: form.client,
          freelancer: form.freelancer,
          milestones,
        },
      }),
    );
  };

  // ── empty-state copy per view ────────────────────────────────────────────
  const emptyMessage =
    view === 'client'
      ? "You have no escrows as client yet."
      : view === 'freelancer'
        ? "You have no escrows as freelancer yet."
        : 'No escrows yet. Create the first one.';

  // ── role helper ───────────────────────────────────────────────────────────
  const roleFor = (c: EscrowContract): 'client' | 'freelancer' | null => {
    if (!walletAddress) return null;
    if (c.client === walletAddress) return 'client';
    if (c.freelancer === walletAddress) return 'freelancer';
    return null;
  };

  return (
    <div className="dash">
      {/* ── creation form ── */}
      <form className="card form" onSubmit={create} aria-labelledby="new-escrow">
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
        <button className="btn btn-primary" type="submit" disabled={busy === 'new'}>
          {busy === 'new' ? 'Creating...' : 'Create escrow'}
        </button>
      </form>

      {/* ── contract list ── */}
      <div className="stack" style={{ minWidth: 0 }}>
        {/* View filter */}
        <ViewFilterControl
          value={view}
          onChange={handleViewChange}
          walletConnected={Boolean(walletAddress)}
        />

        {/* Error banner */}
        {error && (
          <div className="alert alert-error" role="alert" title={error.detail}>
            {error.message}
          </div>
        )}

        {/* Loading */}
        {contracts === null && !error && (
          <div className="card muted">Loading escrows…</div>
        )}

        {/* Empty state */}
        {contracts?.length === 0 && !error && (
          <div className="card muted" data-testid="empty-state">
            {emptyMessage}
          </div>
        )}

        {/* Contract cards */}
        {contracts?.map((c) => {
          const next = c.milestones.find((m) => !m.released);
          const active = c.status === 'Created' || c.status === 'Funded';
          const pct = c.totalAmount
            ? Math.round((c.releasedAmount / c.totalAmount) * 100)
            : 0;
          const role = roleFor(c);

          return (
            <article className="card" key={c.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>
                  #{c.id} {c.title}
                </h3>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {role && <RoleChip role={role} />}
                  <span className={`badge badge-${c.status}`}>{c.status}</span>
                </div>
              </div>
              <p className="small muted" style={{ margin: '6px 0 12px' }}>
                Client <span className="mono">{short(c.client)}</span> &rarr; Freelancer{' '}
                <span className="mono">{short(c.freelancer)}</span>
              </p>
              <div className="progress" aria-label={`${pct}% released`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                Released {c.releasedAmount} / {c.totalAmount} {c.token} &middot; In escrow{' '}
                {c.fundedAmount - c.releasedAmount} {c.token}
              </p>
              <ul className="milestones">
                {c.milestones.map((m) => (
                  <li key={m.index}>
                    <span className="truncate">
                      {m.released ? '[x]' : '[ ]'} {m.title}
                    </span>
                    <span className="mono">
                      {m.amount} {c.token}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="row">
                {active && c.fundedAmount < c.totalAmount && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy === c.id}
                    onClick={() =>
                      act(c.id, () =>
                        api(`/api/v1/contracts/${c.id}/deposit`, {
                          method: 'POST',
                          body: { amount: c.totalAmount - c.fundedAmount },
                        }),
                      )
                    }
                  >
                    Fund {c.totalAmount - c.fundedAmount} {c.token}
                  </button>
                )}
                {active && next && c.fundedAmount - c.releasedAmount >= next.amount && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy === c.id}
                    onClick={() =>
                      act(c.id, () =>
                        api(
                          `/api/v1/contracts/${c.id}/milestones/${next.index}/release`,
                          { method: 'POST' },
                        ),
                      )
                    }
                  >
                    Release next
                  </button>
                )}
                {active && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === c.id}
                      onClick={() =>
                        act(c.id, () =>
                          api(`/api/v1/contracts/${c.id}/dispute`, {
                            method: 'POST',
                            body: { raisedBy: c.client, reason: 'Raised from dashboard' },
                          }),
                        )
                      }
                    >
                      Dispute
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === c.id}
                      onClick={() =>
                        act(c.id, () =>
                          api(`/api/v1/contracts/${c.id}/cancel`, { method: 'POST' }),
                        )
                      }
                    >
                      Cancel
                    </button>
                  </>
                )}
                {c.status === 'Disputed' && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy === c.id}
                    onClick={() =>
                      act(c.id, () =>
                        api(`/api/v1/contracts/${c.id}/resolve`, {
                          method: 'POST',
                          body: { freelancerBps: 5000 },
                        }),
                      )
                    }
                    >
                      Resolve 50/50
                    </button>
                )}
                {c.status === 'Completed' && !c.reputationIssued && (
                  <>
                    <span className="small muted">Rate freelancer:</span>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        className="btn btn-secondary btn-sm"
                        disabled={busy === c.id}
                        onClick={() =>
                          act(c.id, () =>
                            api(`/api/v1/contracts/${c.id}/reputation`, {
                              method: 'POST',
                              body: { rating: r },
                            }),
                          )
                        }
                      >
                        {r}
                      </button>
                    ))}
                  </>
                )}
                {c.status === 'Completed' && c.reputationIssued && (
                  <span className="small muted">Rated. Thanks!</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
