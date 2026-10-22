'use client';

import { FormEvent, useCallback, useState } from 'react';
import { StrKey } from '@stellar/stellar-sdk';
import { Reputation } from '@/lib/api';
import { useReputation } from '@/hooks/useContracts';
import { OnChainReputation, readOnChainReputation } from '@/lib/stellar/reputation';
import { site } from '@/lib/site';

const DEMO_ADDRESS = 'GFREELANCERDEMOBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

export function ReputationLookup() {
  const [address, setAddress] = useState(DEMO_ADDRESS);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [queried, setQueried] = useState<string | null>(null);
  const { reputation, error: apiError, mutate: revalidateApi, isLoading: apiIsLoading } = useReputation(queried);

  const [chainResult, setChainResult] = useState<OnChainReputation | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainBusy, setChainBusy] = useState(false);

  const clearResults = useCallback(() => {
    setQueried(null);
    setChainResult(null);
    setChainError(null);
  }, []);

  const mismatch =
    reputation &&
    chainResult &&
    (reputation.averageRating !== chainResult.averageRating ||
      reputation.completedContracts !== chainResult.completedContracts ||
      reputation.totalRating !== chainResult.totalRating);

  const lookup = (e: FormEvent) => {
    e.preventDefault();
    const value = address.trim();
    setAddressError(null);
    clearResults();

    if (!StrKey.isValidEd25519PublicKey(value)) {
      setAddressError('Enter a valid Stellar public address (it must start with G and pass the StrKey checksum).');
      return;
    }

    setQueried(value);
    setChainBusy(true);
    readOnChainReputation(value)
      .then(setChainResult)
      .catch((err) => setChainError((err as Error).message))
      .finally(() => setChainBusy(false));
  };

  const retryApi = () => {
    revalidateApi();
  };

  const retryChain = async () => {
    const value = address.trim();
    setChainError(null);
    setChainBusy(true);
    try {
      setChainResult(await readOnChainReputation(value));
    } catch (err) {
      setChainError((err as Error).message);
    } finally {
      setChainBusy(false);
    }
  };

  const statRow = (label: string, value: React.ReactNode, id: string) => (
    <div key={id} className="stat-row">
      <dt id={id}>{label}</dt>
      <dd aria-labelledby={id}>{value}</dd>
    </div>
  );

  const displayError = apiError
    ? {
        message: apiError.message,
        detail: apiError.userMessage,
      }
    : null;

  return (
    <div className="stack" style={{ maxWidth: 720, paddingBottom: 64 }}>
      <form className="card form" onSubmit={lookup}>
        <div className="field">
          <label htmlFor="address">Freelancer address</label>
          <div className="row">
            <input
              id="address"
              className="input mono"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              aria-invalid={addressError ? 'true' : 'false'}
              aria-describedby={addressError ? 'address-error' : undefined}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={apiIsLoading || chainBusy}>
              {apiIsLoading || chainBusy ? 'Looking up...' : 'Look up'}
            </button>
          </div>
          {addressError && (
            <div id="address-error" role="alert" className="alert alert-error">
              {addressError}
            </div>
          )}
        </div>
      </form>

      {(reputation || chainResult || apiError || chainError) && (
        <div className="results" role="region" aria-label="Reputation results" aria-live="polite">
          {mismatch && (
            <div className="notice notice-info" role="status">
              <strong>The values differ.</strong> The TalentTrust API is a demo mirror &mdash; its data lives in memory
              and can reset. The on-chain value recorded by the escrow contract on Stellar is authoritative.
            </div>
          )}
          <div className="grid grid-2">
            {chainResult || chainError ? (
              <div className="card">
                <h3 id="onchain-heading">On-chain (verified)</h3>
                <p className="small muted">Stellar {site.network} &middot; get_reputation</p>
                {chainError ? (
                  <>
                    <div className="alert alert-error">{chainError}</div>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={retryChain}
                      aria-label="Retry on-chain reputation check"
                    >
                      Retry on-chain
                    </button>
                  </>
                ) : (
                  chainResult && (
                    <>
                      <dl className="stats" aria-labelledby="onchain-heading">
                        {statRow('Completed contracts', chainResult.completedContracts, 'onchain-contracts')}
                        {statRow('Total rating points', chainResult.totalRating, 'onchain-total')}
                        {statRow(
                          'Average rating',
                          `${chainResult.averageRating.toFixed(2)} / 5`,
                          'onchain-average',
                        )}
                      </dl>
                      <p className="small" style={{ marginTop: 12 }}>
                        <a
                          href={`https://stellar.expert/explorer/${site.network}/account/${encodeURIComponent(
                            address.trim(),
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View account ${address.trim()} on stellar.expert (opens in a new tab)`}
                        >
                          View on stellar.expert
                        </a>
                      </p>
                    </>
                  )
                )}
              </div>
            ) : null}
            {reputation || apiError ? (
              <div className="card">
                <h3 id="api-heading">TalentTrust API (demo)</h3>
                <p className="small muted">In-memory demo data; may reset.</p>
                {apiError ? (
                  <>
                    <div className="alert alert-error" role="alert" title={displayError!.detail}>
                      {displayError!.message}
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={retryApi}
                      aria-label="Retry API reputation check"
                    >
                      Retry API
                    </button>
                  </>
                ) : (
                  reputation && (
                    <dl className="stats" aria-labelledby="api-heading">
                      {statRow('Completed contracts', reputation.completedContracts, 'api-contracts')}
                      {statRow('Total rating points', reputation.totalRating, 'api-total')}
                      {statRow('Average rating', `${(reputation.averageRating ?? 0).toFixed(2)} / 5`, 'api-average')}
                    </dl>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
