import { render, screen } from '@testing-library/react';
import ReputationProfile from './ReputationProfile';

describe('ReputationProfile', () => {
  it('renders no-reputation state with safe defaults', () => {
    render(<ReputationProfile name="Guest User" history={[]} />);

    expect(screen.getByText(/No reputation yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Private by default/i)).toBeInTheDocument();
    expect(screen.getByText(/Your profile remains safe and privacy-friendly until then/i)).toBeInTheDocument();
  });

  it('renders populated reputation state and safe history events', () => {
    const history = [
      {
        id: '1',
        type: 'Verification',
        summary: 'Completed identity verification',
        date: '2026-04-24',
      },
      {
        id: '2',
        type: 'On-chain review',
        summary: 'Received positive trust signal',
        date: '2026-04-23',
      },
    ];

    render(
      <ReputationProfile name="Verified User" score={88} level="Trusted Contributor" history={history} />
    );

    expect(screen.getByText(/88/)).toBeInTheDocument();
    expect(screen.getByText(/Trusted Contributor/i)).toBeInTheDocument();
    expect(screen.getByText(/Completed identity verification/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-23/i)).toBeInTheDocument();
  });
});
