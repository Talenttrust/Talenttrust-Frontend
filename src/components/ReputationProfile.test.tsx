import { render, screen, within } from '@testing-library/react';
import ReputationProfile, { ReputationEvent } from './ReputationProfile';
import { testA11y } from '../test-utils/a11y';

const sampleHistory: ReputationEvent[] = [
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

describe('ReputationProfile', () => {
  it('renders no-reputation state with safe defaults', () => {
    render(<ReputationProfile name="Guest User" history={[]} />);

    expect(screen.getByText(/No reputation yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending/i)).toBeInTheDocument();
    expect(screen.getByText(/Private by default/i)).toBeInTheDocument();
    expect(screen.getByText(/Your profile remains safe and privacy-friendly until then/i)).toBeInTheDocument();

    // Partial banner must NOT show when there's no score at all
    expect(screen.queryByText(/Partial reputation data/i)).not.toBeInTheDocument();
  });

  it('treats a score of 0 as a real reputation value, not "no reputation"', () => {
    render(<ReputationProfile name="Zero Score" score={0} history={[]} />);

    const scoreLabel = document.getElementById('reputation-score-label') as HTMLElement;
    const scoreBlock = scoreLabel.closest('div') as HTMLElement;

    expect(within(scoreBlock).queryByText(/No reputation yet/i)).not.toBeInTheDocument();
    expect(within(scoreBlock).getByText('0')).toBeInTheDocument();

    // score=0 + empty history should still trigger the partial banner
    expect(screen.getByText(/Partial reputation data/i)).toBeInTheDocument();
  });

  it('shows the partial banner and private pill when a score exists but history is empty', () => {
    render(
      <ReputationProfile name="Partial User" score={42} level="Rising Contributor" history={[]} />
    );

    expect(screen.getByText(/Partial reputation data/i)).toBeInTheDocument();
    expect(
      screen.getByText(/A score exists but history is currently hidden/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Private by default/i)).toBeInTheDocument();

    // Score and level should render normally, not the "no reputation" fallbacks
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Rising Contributor')).toBeInTheDocument();
  });

  it('renders populated reputation state and safe history events, with no a11y violations', async () => {
    await testA11y(
      <ReputationProfile name="Verified User" score={88} level="Trusted Contributor" history={sampleHistory} />
    );

    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText(/Trusted Contributor/i)).toBeInTheDocument();
    expect(screen.getByText(/Completed identity verification/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-23/i)).toBeInTheDocument();

    // History is visible, and the partial banner must not appear
    expect(screen.getByText(/^Visible$/i)).toBeInTheDocument();
    expect(screen.queryByText(/Partial reputation data/i)).not.toBeInTheDocument();

    // Each event renders as its own list item
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(sampleHistory.length);
  });

  it('renders a single-character name as an uppercased avatar initial', () => {
    render(<ReputationProfile name="x" score={10} history={[]} />);

    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('associates the score and level values with their labels via aria-labelledby', () => {
    render(
      <ReputationProfile name="Labelled User" score={77} level="Trusted Contributor" history={sampleHistory} />
    );

    const scoreValue = screen.getByText((_, el) => el?.getAttribute('aria-labelledby') === 'reputation-score-label');
    const scoreLabel = document.getElementById('reputation-score-label');
    expect(scoreLabel).toHaveTextContent('Reputation score');
    expect(scoreValue.getAttribute('aria-labelledby')).toBe(scoreLabel?.id);

    const levelValue = screen.getByText((_, el) => el?.getAttribute('aria-labelledby') === 'reputation-level-label');
    const levelLabel = document.getElementById('reputation-level-label');
    expect(levelLabel).toHaveTextContent('Level');
    expect(levelValue.getAttribute('aria-labelledby')).toBe(levelLabel?.id);
  });

  it('exposes an sr-only heading naming the profile owner', () => {
    render(<ReputationProfile name="Heading Check" score={5} history={[]} />);

    const heading = screen.getByRole('heading', { name: /Reputation profile for Heading Check/i, level: 2 });
    expect(heading).toHaveClass('sr-only');
  });
});