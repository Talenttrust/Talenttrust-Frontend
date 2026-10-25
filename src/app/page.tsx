import Link from 'next/link';
import { site, explorerUrl, apiDocsUrl } from '@/lib/site';
import { CopyButton } from '@/components/CopyButton';

const steps = [
  { title: 'Agree on milestones', body: 'Client and freelancer define the scope as a list of milestones, each with its own payment.' },
  { title: 'Fund the escrow', body: 'The client deposits the full budget into the Soroban escrow contract. Nobody can move it unilaterally.' },
  { title: 'Deliver and release', body: 'As each milestone is approved the client releases it and the freelancer is paid instantly on Stellar.' },
  { title: 'Rate and build trust', body: 'Completed engagements earn the freelancer an on-chain rating that follows them to the next job.' },
];

const features = [
  { icon: '$', title: 'Funds held by code', body: 'Payments sit in a smart contract, not in a platform bank account. Rules are public and enforced on-chain.' },
  { icon: '#', title: 'Milestone payouts', body: 'Up to 20 milestones per engagement, released one by one so both sides carry less risk.' },
  { icon: '!', title: 'Fair dispute resolution', body: 'Either party can freeze an escrow. An arbiter splits the held balance by basis points.' },
  { icon: '*', title: 'Portable reputation', body: 'Ratings are tied to completed contracts, so reviews cannot be faked without paying for real work.' },
  { icon: '~', title: 'Fast and cheap', body: 'Stellar settles in seconds with fees measured in fractions of a cent.' },
  { icon: '{}', title: 'Open API', body: 'A documented REST API mirrors the contract so marketplaces can integrate in an afternoon.' },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="eyebrow">
            <span className="dot" /> Live on Stellar {site.network}
          </span>
          <h1>
            Get paid for great work, <span className="grad">without trusting a middleman.</span>
          </h1>
          <p className="lead">
            TalentTrust is a decentralized escrow protocol for freelancers and clients. Lock the budget in a Soroban smart
            contract, release it milestone by milestone, and build reputation that is earned, not bought.
          </p>
          <div className="actions">
            <Link href="/contracts" className="btn btn-primary">
              Explore live escrows
            </Link>
            <Link href="/docs" className="btn btn-secondary">
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="how-it-works">
        <div className="container">
          <h2>How it works</h2>
          <p className="section-lead">Four steps from handshake to payout. Every state change is recorded by the escrow contract.</p>
          <div className="grid grid-4">
            {steps.map((s, i) => (
              <div className="card" key={s.title}>
                <div className="step-num">Step {i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Built for trust on both sides</h2>
          <p className="section-lead">Clients only pay for delivered work. Freelancers know the money is really there before they start.</p>
          <div className="grid grid-3">
            {features.map((f) => (
              <div className="card" key={f.title}>
                <div className="icon" aria-hidden>
                  {f.icon}
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container grid grid-2" style={{ alignItems: 'center' }}>
          <div>
            <h2>Deployed and verifiable</h2>
            <p className="section-lead" style={{ marginBottom: 20 }}>
              The escrow contract is deployed on Stellar {site.network}. Inspect every transaction on stellar.expert or try the
              API from your browser.
            </p>
            <div className="actions">
              <a className="btn btn-primary" href={explorerUrl} target="_blank" rel="noreferrer">
                View contract
              </a>
              <a className="btn btn-secondary" href={apiDocsUrl} target="_blank" rel="noreferrer">
                API reference
              </a>
            </div>
          </div>
          <div className="card">
            <dl className="kv">
              <dt>Network</dt>
              <dd>Stellar {site.network}</dd>
              <dt>Contract ID</dt>
              <dd>
                <code>{site.contractId}</code> <CopyButton value={site.contractId} />
              </dd>
              <dt>API</dt>
              <dd>
                <a href={site.apiUrl} target="_blank" rel="noreferrer">
                  {site.apiUrl.replace('https://', '')}
                </a>
              </dd>
              <dt>Source</dt>
              <dd>
                <a href={site.github} target="_blank" rel="noreferrer">
                  github.com/Talenttrust
                </a>
              </dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta">
            <h2>Start your first escrow in a minute</h2>
            <p>Create a demo engagement, fund it and release milestones against the live API.</p>
            <Link href="/contracts" className="btn btn-primary">
              Open the escrow dashboard
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
