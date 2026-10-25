'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { site } from '@/lib/site';
import { stroopsFromXlm, xlmFromStroops, StroopConversionError } from '@/lib/stellar/stroops';
import { getWalletAddress, getWalletNetworkDetails } from '@/lib/stellar/createContract/freighter';
import { buildCreateContractTx, TESTNET_PASSPHRASE, XLM_SAC_ID } from '@/lib/stellar/createContract/escrow';
import { simulateSignSubmit } from '@/lib/stellar/createContract/submit';

/** UX phases for the on-chain submit flow. */
type OnchainPhase = 'idle' | 'simulating' | 'signing' | 'submitting' | 'confirmed' | 'error';

interface OnchainResult {
  hash: string;
  escrowId: string;
}

const phaseLabel: Record<OnchainPhase, string> = {
  idle: 'Create on-chain escrow',
  simulating: 'Simulating…',
  signing: 'Waiting for signature…',
  submitting: 'Submitting…',
  confirmed: 'Create on-chain escrow',
  error: 'Create on-chain escrow',
};

/**
 * Builds create_contract for the deployed Soroban escrow, asks Freighter to sign
 * it as the client and submits it to testnet.
 */
export function OnchainCreateForm() {
  const [walletAddress, setWalletAddress] = useState('');
  const [walletError, setWalletError] = useState<string | null>(null);
  const [form, setForm] = useState({ freelancer: '', token: XLM_SAC_ID, milestones: 'Design: 100, Build: 200' });
  const [phase, setPhase] = useState<OnchainPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnchainResult | null>(null);
  const successRef = useRef<HTMLParagraphElement>(null);

  // Connect the wallet and verify it is on testnet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setWalletError(null);
      try {
        const { address, error: addrErr } = await getWalletAddress();
        if (cancelled) return;
        if (addrErr || !address) {
          setWalletError('Wallet not connected. Open Freighter and connect to this site.');
          return;
        }
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
      } catch {
        if (!cancelled) setWalletError('Wallet not connected. Open Freighter and connect to this site.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase === 'confirmed') successRef.current?.focus();
  }, [phase]);

  const parts = () =>
    form.milestones
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!walletAddress) {
      setError(walletError ?? 'Wallet not connected.');
      setPhase('error');
      return;
    }

    let amounts: bigint[];
    try {
      amounts = parts().map((p) => stroopsFromXlm(p.includes(':') ? p.slice(p.lastIndexOf(':') + 1).trim() : p));
    } catch (err) {
      setError(err instanceof StroopConversionError ? err.message : String(err));
      setPhase('error');
      return;
    }
    if (amounts.length === 0 || amounts.length > 20) {
      setError('Between 1 and 20 milestones are required.');
      setPhase('error');
      return;
    }

    const milestoneLines = parts()
      .map((p, i) => {
        const title = p.includes(':') ? p.slice(0, p.lastIndexOf(':')).trim() : `Milestone ${i + 1}`;
        return `  • ${title}: ${xlmFromStroops(amounts[i])} XLM`;
      })
      .join('\n');
    const confirmed = window.confirm(
      `You are about to create an on-chain escrow:\n\n` +
        `Client: ${walletAddress}\n` +
        `Freelancer: ${form.freelancer}\n` +
        `Token SAC: ${form.token}\n\n` +
        `Milestones:\n${milestoneLines}\n\n` +
        `Your wallet will ask you to sign. Continue?`,
    );
    if (!confirmed) return;

    try {
      setPhase('simulating');
      const tx = await buildCreateContractTx({
        client: walletAddress,
        freelancer: form.freelancer,
        token: form.token,
        amounts,
      });
      // simulateSignSubmit handles prepare → sign → send → poll
      setPhase('signing');
      const { hash, returnValue } = await simulateSignSubmit(tx);
      setResult({ hash, escrowId: String(returnValue ?? '?') });
      setPhase('confirmed');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  const inFlight = phase === 'simulating' || phase === 'signing' || phase === 'submitting';
  const txExplorerUrl = (hash: string) => `https://stellar.expert/explorer/${site.network}/tx/${hash}`;

  return (
    <form onSubmit={submit} aria-label="New on-chain escrow" className="form stack" style={{ gap: 14 }}>
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
          value={walletAddress || (walletError ? '' : 'Connecting wallet…')}
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
          value={form.freelancer}
          onChange={(e) => setForm({ ...form, freelancer: e.target.value })}
          placeholder="G…"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="oc-token">Token (Stellar Asset Contract id)</label>
        <input
          id="oc-token"
          className="input mono"
          value={form.token}
          onChange={(e) => setForm({ ...form, token: e.target.value })}
          required
          aria-describedby="oc-token-hint"
        />
        <span id="oc-token-hint" className="small muted">
          Defaults to the native XLM SAC. Amounts are in XLM (e.g. &ldquo;100&rdquo; = 100 XLM).
        </span>
      </div>

      <div className="field">
        <label htmlFor="oc-milestones">Milestones (XLM amounts)</label>
        <input
          id="oc-milestones"
          className="input"
          value={form.milestones}
          onChange={(e) => setForm({ ...form, milestones: e.target.value })}
          required
          aria-describedby="oc-milestones-hint"
        />
        <span id="oc-milestones-hint" className="small muted">
          Comma separated, as Title: XLM amount (e.g. &ldquo;Design: 100, Build: 200&rdquo;). Max 20.
        </span>
      </div>

      <div aria-live="polite" aria-atomic="true" style={{ minHeight: '1.5em' }}>
        {inFlight && (
          <p className="small muted" style={{ margin: 0 }}>
            {phaseLabel[phase]}
          </p>
        )}
        {phase === 'error' && error && (
          <p className="small" style={{ margin: 0, color: 'var(--bad)' }} role="alert">
            {error}
          </p>
        )}
        {phase === 'confirmed' && result && (
          <p className="small" style={{ margin: 0, color: 'var(--ok)' }} ref={successRef} tabIndex={-1}>
            ✓ On-chain escrow #{result.escrowId} created!{' '}
            <a href={txExplorerUrl(result.hash)} target="_blank" rel="noreferrer" style={{ color: 'var(--ok)' }}>
              View transaction ↗
            </a>
          </p>
        )}
      </div>

      <button className="btn btn-primary" type="submit" disabled={inFlight || !!walletError || !walletAddress}>
        {phaseLabel[phase]}
      </button>
    </form>
  );
}
