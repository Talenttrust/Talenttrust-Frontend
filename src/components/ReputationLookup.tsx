'use client';

import { FormEvent, useRef, useState } from 'react';
import { api, ApiError, ApiSchemaError, Reputation } from '@/lib/api';
import { ReputationSchema } from '@/lib/schemas';

export function ReputationLookup() {
  const [address, setAddress] = useState('GFREELANCERDEMOBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
  const [result, setResult] = useState<Reputation | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    const id = ++requestId.current;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await api<Reputation>(`/api/v1/reputation/${encodeURIComponent(address.trim())}`, {
        signal: ctrl.signal,
        schema: ReputationSchema,
      });
      if (id !== requestId.current) return;
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'aborted') return;
      if (id !== requestId.current) return;
      if (err instanceof ApiSchemaError) {
        setError({ message: 'The API returned data in an unexpected format' });
      } else {
        const detail = err instanceof ApiError ? err.message : (err as Error).message;
        setError({ message: err instanceof ApiError ? err.userMessage : detail, detail });
      }
      setResult(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 720, paddingBottom: 64 }}>
      <form className="card form" onSubmit={lookup}>
        <div className="field">
          <label htmlFor="address">Freelancer address</label>
          <div className="row">
            <input id="address" className="input mono" value={address} onChange={(e) => setAddress(e.target.value)} required />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Looking up...' : 'Look up'}
            </button>
          </div>
        </div>
      </form>
      {error && (
        <div className="alert alert-error" role="alert" title={error.detail} data-testid="schema-error">
          {error.message}
        </div>
      )}
      {result && (
        <div className="grid grid-3">
          <div className="card">
            <p className="small">Average rating</p>
            <h3 style={{ fontSize: '2rem', margin: '4px 0 0' }}>{result.averageRating ? `${result.averageRating} / 5` : 'No ratings'}</h3>
          </div>
          <div className="card">
            <p className="small">Completed contracts</p>
            <h3 style={{ fontSize: '2rem', margin: '4px 0 0' }}>{result.completedContracts}</h3>
          </div>
          <div className="card">
            <p className="small">Total rating points</p>
            <h3 style={{ fontSize: '2rem', margin: '4px 0 0' }}>{result.totalRating}</h3>
          </div>
        </div>
      )}
    </div>
  );
}