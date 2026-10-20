'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';

interface ResolveDisputeFormProps {
  id: number;
  held: number;
  token: string;
  busy: boolean;
  onResolve: (freelancerBps: number) => Promise<void>;
}

const presets = [0, 2500, 5000, 7500, 10000];

export function previewSplit(held: number, bps: number): { freelancer: number; client: number } {
  if (!Number.isSafeInteger(held) || held < 0) {
    throw new RangeError('Held amount must be a non-negative safe integer.');
  }
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new RangeError('Freelancer share must be an integer from 0 to 10000 basis points.');
  }

  const freelancer = Number((BigInt(held) * BigInt(bps)) / 10000n);
  return { freelancer, client: held - freelancer };
}

function percentFor(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, '');
}

function parsePercent(value: string): number | null {
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) return null;

  const [whole = '0', fraction = ''] = value.split('.');
  const bps = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(bps) && bps >= 0 && bps <= 10000 ? bps : null;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString();
}

export function ResolveDisputeForm({ id, held, token, busy, onResolve }: ResolveDisputeFormProps) {
  const [bps, setBps] = useState(5000);
  const [percent, setPercent] = useState('50');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const split = previewSplit(held, bps);
  const valid = parsePercent(percent) !== null;

  useEffect(() => {
    if (wasConfirming.current && !confirming) reviewButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const updateShare = (nextBps: number) => {
    const value = Math.max(0, Math.min(10000, Math.round(nextBps)));
    setBps(value);
    setPercent(percentFor(value));
    setError(null);
  };

  const updatePercent = (value: string) => {
    setPercent(value);
    setError(null);
    const nextBps = parsePercent(value);
    if (nextBps !== null) setBps(nextBps);
  };

  const confirm = async () => {
    setError(null);
    try {
      await onResolve(bps);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resolve this dispute.');
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && confirming && !busy) {
      event.preventDefault();
      setConfirming(false);
    }
  };

  return (
    <div className="resolve-form" onKeyDown={handleKeyDown}>
      <h4>Proposed payout split</h4>
      <div className="resolve-share">
        <label htmlFor={`freelancer-share-${id}`}>Freelancer share</label>
        <div className="resolve-number">
          <input
            id={`freelancer-share-${id}`}
            className="input"
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={percent}
            aria-invalid={!valid}
            aria-describedby={`share-help-${id}`}
            onChange={(event) => updatePercent(event.target.value)}
          />
          <span aria-hidden="true">%</span>
        </div>
        <input
          className="resolve-slider"
          type="range"
          min="0"
          max="10000"
          step="1"
          value={bps}
          aria-label="Freelancer share"
          aria-valuetext={`${percentFor(bps)}% to freelancer`}
          aria-describedby={`share-help-${id}`}
          onChange={(event) => updateShare(Number(event.target.value))}
        />
        <span id={`share-help-${id}`} className="small muted">
          Choose a share from 0% to 100% in 0.01% steps.
        </span>
      </div>
      <div className="row resolve-presets" aria-label="Payout split presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className="btn btn-secondary btn-sm"
            aria-pressed={bps === preset && valid}
            onClick={() => updateShare(preset)}
          >
            {preset / 100}%
          </button>
        ))}
      </div>
      <dl className="resolve-preview" aria-live="polite">
        <div>
          <dt>Freelancer receives</dt>
          <dd>{formatAmount(split.freelancer)} {token}</dd>
        </div>
        <div>
          <dt>Client refunded</dt>
          <dd>{formatAmount(split.client)} {token}</dd>
        </div>
      </dl>
      {!valid && <p className="small alert alert-error" role="alert">Enter a percentage from 0 to 100 with up to two decimal places.</p>}
      {error && <p className="small alert alert-error" role="alert">{error}</p>}
      {!confirming ? (
        <button
          ref={reviewButton}
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!valid || busy}
          onClick={() => setConfirming(true)}
        >
          Review resolution
        </button>
      ) : (
        <div className="resolve-confirm" aria-live="polite">
          <p>
            Confirm: freelancer receives {formatAmount(split.freelancer)} {token}; client is refunded{' '}
            {formatAmount(split.client)} {token}.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={confirm}>
              {busy ? 'Resolving...' : 'Confirm resolution'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirming(false)}>
              Change split
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
