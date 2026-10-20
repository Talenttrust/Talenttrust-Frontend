'use client';

import { FormEvent, useState } from 'react';
import { api, ApiSchemaError, Reputation } from '@/lib/api';
import { ReputationSchema } from '@/lib/schemas';

export function ReputationLookup() {
  const [address, setAddress] = useState('GFREELANCERDEMOBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
  const [result, setResult] = useState<Reputation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await api(`/api/v1/reputation/${encodeURIComponent(address.trim())}`, ReputationSchema));
    } catch (err) {
      if (err instanceof ApiSchemaError) {
        setError('The API returned data in an unexpected format');
      } else {
        setError((err as Error).message);
      }
      setResult(null);
    } finally {
      setLoading(false);
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
        <div className="alert alert-error" role="alert" data-testid="schema-error">
          {error}
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
