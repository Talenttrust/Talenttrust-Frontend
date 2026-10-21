'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, EscrowContract } from '@/lib/api';
import { site, XLM_SAC_ID } from '@/lib/site';
import { stroopsFromXlm, xlmFromStroops, StroopConversionError } from '@/lib/stellar/stroops';
import { getWalletAddress, getWalletNetworkDetails } from '@/lib/stellar/freighter';
import { buildCreateContractTx, TESTNET_PASSPHRASE } from '@/lib/stellar/escrow';
import { simulateSignSubmit } from '@/lib/stellar/submit';

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

type CreateMode = 'demo' | 'onchain';

/** UX phases for the on-chain submit flow. */
type OnchainPhase =
  | 'idle'
  | 'simulating'
  | 'signing'
  | 'submitting'
  | 'confirmed'
  | 'error';

interface OnchainResult {
  hash: string;
  escrowId: string;
}

export function EscrowDashboard() {
  const [contracts, setContracts] = useState<EscrowContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | 'new' | null>(null);

  // ── Mode toggle ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<CreateMode>('demo');

  // ── Demo API form state ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    title: 'Website redesign',
    client: 'GCLIENT' + 'X'.repeat(49),
    freelancer: 'GFREELANCER' + 'Y'.repeat(45),
    milestones: 'Design: 300, Build: 700',
  });

  // ── On-chain form state ──────────────────────────────────────────────────
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [walletError, setWalletError] = useState<string | null>(null);
  const [onchainForm, setOnchainForm] = useState({
    freelancer: '',
    token: XLM_SAC_ID,
    milestones: 'Design: 100, Build: 200',
  });
  const [onchainPhase, setOnchainPhase] = useState<OnchainPhase>('idle');
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [onchainResult, setOnchainResult] = useState<OnchainResult | null>(null);

  // Focus target for accessibility: move focus to success message on confirm
  const successRef = useRef<HTMLParagraphElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  // ── Load contracts list ──────────────────────────────────────────────────
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

  // ── Connect wallet when switching to on-chain mode ───────────────────────
  useEffect(() => {
    if (mode !== 'onchain') return;
    let cancelled = false;
    (async () => {
      setWalletError(null);
      const { address, error: addrErr } = await getWalletAddress();
      if (cancelled) return;
      if (addrErr || !address) {
        setWalletError('Wallet not connected. Open Freighter and connect to this site.');
        return;
      }
      // Verify network
      const { networkPassphrase, error: netErr } = await getWalletNetworkDetails();
      if (cancelled) return;
      if (netErr) {
        setWalletError(`Could not read wallet network: ${netErr}`);
        return;
      }
      if (networkPassphrase !== TESTNET_PASSPHRASE) {
        setWalletError('Wrong network: switch Freighter to Stellar Testnet and try again.');
        return;
      }
      setWalletAddress(address);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Move focus to success message after confirmation
  useEffect(() => {
    if (onchainPhase === 'confirmed') {
      successRef.current?.focus();
    }
  }, [onchainPhase]);

  // ── Demo API submit ──────────────────────────────────────────────────────
  const act = async (id: number | 'new', fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createDemo = (e: FormEvent) => {
    e.preventDefault();
    const milestones = form.milestones
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part, i) => {
        const [title, amount] = part.includes(':') ? part.split(':') : [`Milestone ${i + 1}`, part];
        return { title: title.trim(), amount: Number(amount) };
      });
    act('new', () =>
      api('/api/v1/contracts', {
        method: 'POST',
        body: { title: form.title, client: form.client, freelancer: form.freelancer, milestones },
      }),
    );
  };

  // ── On-chain submit ──────────────────────────────────────────────────────
  const createOnchain = async (e: FormEvent) => {
    e.preventDefault();
    setOnchainError(null);
    setOnchainResult(null);

    // Guard: wallet must be connected and on testnet
    if (!walletAddress) {
      setOnchainError(walletError ?? 'Wallet not connected.');
      return;
    }

    // Parse milestone amounts from "Title: xlm, ..." format
    let amounts: bigint[];
    try {
      amounts = onchainForm.milestones
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const amountStr = p.includes(':') ? p.split(':')[1].trim() : p.trim();
          return stroopsFromXlm(amountStr);
        });
    } catch (err) {
      setOnchainError(err instanceof StroopConversionError ? err.message : String(err));
      return;
    }

    if (amounts.length === 0 || amounts.length > 20) {
      setOnchainError('Between 1 and 20 milestones are required.');
      return;
    }

    // Build human-readable summary for the user before signing
    const milestoneLines = onchainForm.milestones
      .split(',')
      .map((p, i) => {
        const parts = p.includes(':') ? p.split(':') : [`Milestone ${i + 1}`, p];
        return `  • ${parts[0].trim()}: ${xlmFromStroops(amounts[i])} XLM`;
      })
      .join('\n');

    const confirmed = window.confirm(
      `You are about to create an on-chain escrow:\n\n` +
        `Client: ${walletAddress}\n` +
        `Freelancer: ${onchainForm.freelancer}\n` +
        `Token SAC: ${onchainForm.token}\n\n` +
        `Milestones:\n${milestoneLines}\n\n` +
        `Your wallet will ask you to sign. Continue?`,
    );
    if (!confirmed) return;

    try {
      setOnchainPhase('simulating');
      const tx = await buildCreateContractTx({
        client: walletAddress,
        freelancer: onchainForm.freelancer,
        token: onchainForm.token,
        amounts,
      });

      setOnchainPhase('signing');
      // simulateSignSubmit handles prepare → sign → send → poll
      setOnchainPhase('submitting');
      const { hash, returnValue } = await simulateSignSubmit(tx);

      const escrowId = String(returnValue ?? '?');
      setOnchainResult({ hash, escrowId });
      setOnchainPhase('confirmed');
    } catch (err) {
      setOnchainError((err as Error).message);
      setOnchainPhase('error');
    }
  };

  const onchainInFlight =
    onchainPhase === 'simulating' ||
    onchainPhase === 'signing' ||
    onchainPhase === 'submitting';

  const phaseLabel: Record<OnchainPhase, string> = {
    idle: 'Create on-chain escrow',
    simulating: 'Simulating…',
    signing: 'Waiting for signature…',
    submitting: 'Submitting…',
    confirmed: 'Create on-chain escrow',
    error: 'Create on-chain escrow',
  };

  const txExplorerUrl = (hash: string) =>
    `https://stellar.expert/explorer/${site.network}/tx/${hash}`;

  return (
    <div className="dash">
      {/* ── Create form ──────────────────────────────────────────────────── */}
      <div className="card form stack" style={{ gap: 16 }}>
        <h3 id="new-escrow" style={{ margin: 0 }}>New escrow</h3>

        {/* Mode toggle */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field" style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>
            Mode
          </legend>
          <div className="row" style={{ gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="create-mode"
                value="demo"
                checked={mode === 'demo'}
                onChange={() => setMode('demo')}
              />
              Demo API
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="create-mode"
                value="onchain"
                checked={mode === 'onchain'}
                onChange={() => setMode('onchain')}
              />
              On-chain (testnet)
            </label>
          </div>
        </fieldset>

        {/* ── Demo form ─────────────────────────────────────────────────── */}
        {mode === 'demo' && (
          <form onSubmit={createDemo} aria-labelledby="new-escrow" className="form stack" style={{ gap: 14 }}>
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
        )}

        {/* ── On-chain form ─────────────────────────────────────────────── */}
        {mode === 'onchain' && (
          <form onSubmit={createOnchain} aria-labelledby="new-escrow" className="form stack" style={{ gap: 14 }}>
            {/* Wallet status */}
            {walletError && (
              <div className="alert alert-error" role="alert">
                {walletError}
              </div>
            )}

            <div className="field">
              <label htmlFor="oc-client">Client address (your wallet)</label>
              <input
                id="oc-client"
                className="input mono"
                value={walletAddress || 'Connecting wallet…'}
                readOnly
                aria-describedby="oc-client-hint"
              />
              <span id="oc-client-hint" className="small muted">
                Locked to your connected Freighter wallet — this address must sign.
              </span>
            </div>

            <div className="field">
              <label htmlFor="oc-freelancer">Freelancer address</label>
              <input
                id="oc-freelancer"
                className="input mono"
                value={onchainForm.freelancer}
                onChange={(e) => setOnchainForm({ ...onchainForm, freelancer: e.target.value })}
                placeholder="G…"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="oc-token">Token (Stellar Asset Contract id)</label>
              <input
                id="oc-token"
                className="input mono"
                value={onchainForm.token}
                onChange={(e) => setOnchainForm({ ...onchainForm, token: e.target.value })}
                required
                aria-describedby="oc-token-hint"
              />
              <span id="oc-token-hint" className="small muted">
                Defaults to native XLM SAC. Amounts are in XLM (e.g. &ldquo;100&rdquo; = 100 XLM).
              </span>
            </div>

            <div className="field">
              <label htmlFor="oc-milestones">Milestones (XLM amounts)</label>
              <input
                id="oc-milestones"
                className="input"
                value={onchainForm.milestones}
                onChange={(e) => setOnchainForm({ ...onchainForm, milestones: e.target.value })}
                required
                aria-describedby="oc-milestones-hint"
              />
              <span id="oc-milestones-hint" className="small muted">
                Comma separated, as Title: XLM amount (e.g. &ldquo;Design: 100, Build: 200&rdquo;). Max 20.
              </span>
            </div>

            {/* Inline status region — aria-live so screen readers announce changes */}
            <div
              aria-live="polite"
              aria-atomic="true"
              style={{ minHeight: '1.5em' }}
            >
              {onchainInFlight && (
                <p className="small muted" style={{ margin: 0 }}>
                  {phaseLabel[onchainPhase]}
                </p>
              )}
              {onchainPhase === 'error' && onchainError && (
                <p className="small" style={{ margin: 0, color: 'var(--bad)' }} role="alert">
                  {onchainError}
                </p>
              )}
              {onchainPhase === 'confirmed' && onchainResult && (
                <p
                  className="small"
                  style={{ margin: 0, color: 'var(--ok)' }}
                  ref={successRef}
                  tabIndex={-1}
                >
                  ✓ On-chain escrow #{onchainResult.escrowId} created!{' '}
                  <a
                    href={txExplorerUrl(onchainResult.hash)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--ok)' }}
                  >
                    View transaction ↗
                  </a>
                </p>
              )}
            </div>

            <button
              ref={submitBtnRef}
              className="btn btn-primary"
              type="submit"
              disabled={onchainInFlight || !!walletError || !walletAddress}
            >
              {phaseLabel[onchainPhase]}
            </button>
          </form>
        )}
      </div>

      {/* ── Contracts list ────────────────────────────────────────────────── */}
      <div className="stack" style={{ minWidth: 0 }}>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {contracts === null && <div className="card muted">Loading escrows...</div>}
        {contracts?.length === 0 && !error && <div className="card muted">No escrows yet. Create the first one.</div>}
        {contracts?.map((c) => {
          const next = c.milestones.find((m) => !m.released);
          const active = c.status === 'Created' || c.status === 'Funded';
          const pct = c.totalAmount ? Math.round((c.releasedAmount / c.totalAmount) * 100) : 0;
          return (
            <article className="card" key={c.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>
                  #{c.id} {c.title}
                </h3>
                <span className={`badge badge-${c.status}`}>{c.status}</span>
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
                        api(`/api/v1/contracts/${c.id}/milestones/${next.index}/release`, { method: 'POST' }),
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
