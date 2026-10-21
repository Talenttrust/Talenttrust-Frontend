'use client';

import { FormEvent, useRef, useState } from 'react';
import { api, Reputation } from '@/lib/api';
import { normalizeAddress } from '@/lib/stellar/address';
import { AddressInput, type AddressInputHandle } from '@/components/forms/AddressInput';

export function ReputationLookup() {
  const addressRef = useRef<AddressInputHandle>(null);
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<Reputation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    if (!addressRef.current?.validate()) {
      addressRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setResult(await api<Reputation>(`/api/v1/reputation/${encodeURIComponent(normalizeAddress(address))}`));
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 720, paddingBottom: 64 }}>
      <form className="card form" onSubmit={lookup}>
        <AddressInput
          ref={addressRef}
          id="address"
          label="Freelancer address"
          value={address}
          onChange={setAddress}
          placeholder="G... Stellar account address"
          description="56 characters, starting with G. The checksum is verified before lookup."
        />
        <div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Looking up...' : 'Look up'}
          </button>
        </div>
      </form>
      {error && (
        <div className="alert alert-error" role="alert">
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
