/**
 * ReputationProfile.test.tsx
 *
 * Locks down every conditional rendering branch of ReputationProfile:
 *   1. No reputation yet   – undefined score
 *   2. No reputation yet   – null score
 *   3. Score === 0         – edge: falsy-but-valid score (hasReputation = true)
 *   4. Partial reputation  – score present, history empty  (amber banner)
 *   5. Full reputation     – score present, history non-empty (events rendered)
 *   6. Single-char initial – name.slice(0,1).toUpperCase() avatar edge case
 *
 * Accessibility assertions follow the aria-labelledby contracts expressed in
 * the component source and are verified via jest-axe for the full-history
 * state (as required by issue #135).
 *
 * Types are imported from the component itself – no duplicates.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ReputationProfile, {
  ReputationEvent,
  ReputationProfileProps,
} from './ReputationProfile';
import { assertNoA11yViolations } from '@/test-utils/a11y';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const HISTORY_EVENTS: ReputationEvent[] = [
  {
    id: 'ev-1',
    type: 'Verification',
    summary: 'Completed identity verification',
    date: '2026-04-24',
  },
  {
    id: 'ev-2',
    type: 'On-chain review',
    summary: 'Received positive trust signal',
    date: '2026-04-23',
  },
  {
    id: 'ev-3',
    type: 'Referral',
    summary: 'Referred two new community members',
    date: '2026-04-20',
  },
];

// Convenience wrapper so every render call uses the exported prop type.
function renderProfile(props: ReputationProfileProps) {
  return render(<ReputationProfile {...props} />);
}

// ---------------------------------------------------------------------------
// 1. No-reputation state – undefined score (default)
// ---------------------------------------------------------------------------

describe('ReputationProfile – no reputation (undefined score)', () => {
  beforeEach(() => {
    renderProfile({ name: 'Guest User', history: [] });
  });

  it('renders "No reputation yet" in the score block', () => {
    expect(screen.getByText(/No reputation yet/i)).toBeInTheDocument();
  });

  it('renders "Pending" in the level block', () => {
    expect(screen.getByText(/^Pending$/i)).toBeInTheDocument();
  });

  it('renders "Private by default" pill in the history header', () => {
    expect(screen.getByText(/Private by default/i)).toBeInTheDocument();
  });

  it('renders the empty history message', () => {
    expect(
      screen.getByText(/No reputation history available yet\./i)
    ).toBeInTheDocument();
  });

  it('does NOT render the partial-reputation amber banner', () => {
    expect(screen.queryByText(/Partial reputation data/i)).not.toBeInTheDocument();
  });

  it('does NOT render any history event list items', () => {
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. No-reputation state – explicit null score
// ---------------------------------------------------------------------------

describe('ReputationProfile – no reputation (null score)', () => {
  beforeEach(() => {
    renderProfile({ name: 'Legacy User', score: null, history: [] });
  });

  it('renders "No reputation yet" when score is null', () => {
    expect(screen.getByText(/No reputation yet/i)).toBeInTheDocument();
  });

  it('renders "Pending" when score is null', () => {
    expect(screen.getByText(/^Pending$/i)).toBeInTheDocument();
  });

  it('does NOT show the partial banner for null score', () => {
    expect(screen.queryByText(/Partial reputation data/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Edge case – score of 0 (falsy in JS but valid per hasReputation logic)
// ---------------------------------------------------------------------------

describe('ReputationProfile – score === 0 (edge: falsy-but-valid)', () => {
  beforeEach(() => {
    renderProfile({ name: 'New Member', score: 0, level: 'Newcomer', history: [] });
  });

  it('renders "0" as the score (hasReputation = true for score >= 0)', () => {
    // The score paragraph contains the digit "0" (plus sr-only spans).
    const scorePara = screen.getByText(
      (_c, el) => el?.tagName === 'P' && /0/.test(el.textContent ?? '')
        && el.getAttribute('aria-labelledby') === 'reputation-score-label'
    );
    expect(scorePara).toBeInTheDocument();
  });

  it('renders the level label, not "Pending"', () => {
    expect(screen.getByText(/Newcomer/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Pending$/i)).not.toBeInTheDocument();
  });

  it('shows the partial amber banner because history is empty', () => {
    expect(screen.getByText(/Partial reputation data/i)).toBeInTheDocument();
  });

  it('shows "Private by default" pill', () => {
    expect(screen.getByText(/Private by default/i)).toBeInTheDocument();
  });

  it('does NOT render "No reputation yet"', () => {
    expect(screen.queryByText(/No reputation yet/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Partial reputation – score present, history empty (amber banner)
// ---------------------------------------------------------------------------

describe('ReputationProfile – partial reputation (score, no history)', () => {
  const PARTIAL_PROPS: ReputationProfileProps = {
    name: 'Partial User',
    score: 42,
    level: 'Active Member',
    history: [],
  };

  beforeEach(() => {
    renderProfile(PARTIAL_PROPS);
  });

  it('renders the amber "Partial reputation data" banner', () => {
    expect(screen.getByText(/Partial reputation data/i)).toBeInTheDocument();
  });

  it('renders the banner explanation text', () => {
    expect(
      screen.getByText(/A score exists but history is currently hidden/i)
    ).toBeInTheDocument();
  });

  it('renders "Private by default" pill (history.length === 0)', () => {
    expect(screen.getByText(/Private by default/i)).toBeInTheDocument();
  });

  it('renders the score value', () => {
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('renders the level', () => {
    expect(screen.getByText(/Active Member/i)).toBeInTheDocument();
  });

  it('does NOT render history list items', () => {
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('renders the empty history message', () => {
    expect(
      screen.getByText(/No reputation history available yet\./i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. Full reputation – score present, history non-empty
// ---------------------------------------------------------------------------

describe('ReputationProfile – full reputation (score + history)', () => {
  const FULL_PROPS: ReputationProfileProps = {
    name: 'Verified User',
    score: 88,
    level: 'Trusted Contributor',
    history: HISTORY_EVENTS,
  };

  beforeEach(() => {
    renderProfile(FULL_PROPS);
  });

  it('renders the score value', () => {
    expect(screen.getByText(/88/)).toBeInTheDocument();
  });

  it('renders the level', () => {
    expect(screen.getByText(/Trusted Contributor/i)).toBeInTheDocument();
  });

  it('renders the "Visible" pill (history present)', () => {
    expect(screen.getByText(/^Visible$/i)).toBeInTheDocument();
  });

  it('does NOT render the partial banner', () => {
    expect(screen.queryByText(/Partial reputation data/i)).not.toBeInTheDocument();
  });

  it('does NOT render the empty history message', () => {
    expect(
      screen.queryByText(/No reputation history available yet\./i)
    ).not.toBeInTheDocument();
  });

  it('renders a list item for each ReputationEvent', () => {
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(HISTORY_EVENTS.length);
  });

  it('renders each event type label', () => {
    HISTORY_EVENTS.forEach((ev) => {
      expect(screen.getByText(ev.type)).toBeInTheDocument();
    });
  });

  it('renders each event summary', () => {
    HISTORY_EVENTS.forEach((ev) => {
      expect(screen.getByText(ev.summary)).toBeInTheDocument();
    });
  });

  it('renders each event date', () => {
    HISTORY_EVENTS.forEach((ev) => {
      expect(screen.getByText(ev.date)).toBeInTheDocument();
    });
  });

  it('renders events in DOM order matching the history array', () => {
    const items = screen.getAllByRole('listitem');
    HISTORY_EVENTS.forEach((ev, idx) => {
      expect(within(items[idx]).getByText(ev.summary)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Single-character name initial
// ---------------------------------------------------------------------------

describe('ReputationProfile – single-character name initial', () => {
  it('renders the uppercased first character of a one-letter name', () => {
    renderProfile({ name: 'A', history: [] });
    // The avatar div contains exactly the initial letter.
    expect(screen.getByText('A', { selector: 'div' })).toBeInTheDocument();
  });

  it('uppercases the first character for a lowercase name', () => {
    renderProfile({ name: 'alice', history: [] });
    expect(screen.getByText('A', { selector: 'div' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. Accessible labelling & sr-only structure
// ---------------------------------------------------------------------------

describe('ReputationProfile – accessible labelling', () => {
  it('renders a section element labelled by "profile-heading"', () => {
    renderProfile({ name: 'Aria Test User', history: [] });
    const section = screen.getByRole('region', { name: /Reputation profile for Aria Test User/i });
    expect(section).toBeInTheDocument();
    expect(section.getAttribute('aria-labelledby')).toBe('profile-heading');
  });

  it('renders an sr-only h2 with the user name', () => {
    renderProfile({ name: 'Screen Reader User', history: [] });
    const heading = document.getElementById('profile-heading');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toMatch(/Reputation profile for Screen Reader User/i);
    expect(heading?.classList.contains('sr-only')).toBe(true);
  });

  it('score paragraph carries aria-labelledby="reputation-score-label"', () => {
    renderProfile({ name: 'Score Label User', score: 70, history: [] });
    // The <p> that shows the score must reference the label element.
    const scorePara = document.querySelector('[aria-labelledby="reputation-score-label"]');
    expect(scorePara).not.toBeNull();
  });

  it('level paragraph carries aria-labelledby="reputation-level-label"', () => {
    renderProfile({ name: 'Level Label User', score: 70, history: [] });
    const levelPara = document.querySelector('[aria-labelledby="reputation-level-label"]');
    expect(levelPara).not.toBeNull();
  });

  it('score label element has id="reputation-score-label"', () => {
    renderProfile({ name: 'Label Id User', score: 55, history: [] });
    const labelEl = document.getElementById('reputation-score-label');
    expect(labelEl).not.toBeNull();
    expect(labelEl?.textContent).toMatch(/Reputation score/i);
  });

  it('level label element has id="reputation-level-label"', () => {
    renderProfile({ name: 'Level Id User', score: 55, history: [] });
    const labelEl = document.getElementById('reputation-level-label');
    expect(labelEl).not.toBeNull();
    expect(labelEl?.textContent).toMatch(/^Level$/i);
  });

  it('sr-only span announces "Reputation score " before the numeric value', () => {
    renderProfile({ name: 'SR Score User', score: 77, history: [] });
    const srSpans = screen.getAllByText(/Reputation score /i);
    // At least one sr-only span should exist.
    const srOnlySpan = srSpans.find((el) => el.classList.contains('sr-only'));
    expect(srOnlySpan).toBeDefined();
  });

  it('sr-only span announces " out of 5" after the numeric score', () => {
    renderProfile({ name: 'SR Out User', score: 77, history: [] });
    const outOf5 = screen.getAllByText(/ out of 5/i);
    const srOnlySpan = outOf5.find((el) => el.classList.contains('sr-only'));
    expect(srOnlySpan).toBeDefined();
  });

  it('sr-only span announces "Level " before the level text when score exists', () => {
    renderProfile({ name: 'SR Level User', score: 77, level: 'Expert', history: [] });
    const levelSpans = screen.getAllByText(/^Level $/i);
    const srOnlySpan = levelSpans.find((el) => el.classList.contains('sr-only'));
    expect(srOnlySpan).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Default prop values
// ---------------------------------------------------------------------------

describe('ReputationProfile – default prop values', () => {
  it('defaults level to "Community Member" when not provided', () => {
    renderProfile({ name: 'Default User', score: 50 });
    expect(screen.getByText(/Community Member/i)).toBeInTheDocument();
  });

  it('defaults history to [] (no events rendered, no crash)', () => {
    // No history prop → should not throw and should show empty state.
    renderProfile({ name: 'Default History User', score: 50 });
    expect(
      screen.getByText(/No reputation history available yet\./i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. Accessibility – jest-axe audit on full-history state (issue #135 req.)
// ---------------------------------------------------------------------------

describe('ReputationProfile – jest-axe audit', () => {
  it('full-history state has no axe violations', async () => {
    const { container } = render(
      <ReputationProfile
        name="Verified User"
        score={88}
        level="Trusted Contributor"
        history={HISTORY_EVENTS}
      />
    );
    await assertNoA11yViolations(container);
  });

  it('no-reputation state has no axe violations', async () => {
    const { container } = render(
      <ReputationProfile name="Guest User" history={[]} />
    );
    await assertNoA11yViolations(container);
  });

  it('partial-reputation state has no axe violations', async () => {
    const { container } = render(
      <ReputationProfile name="Partial User" score={42} level="Active Member" history={[]} />
    );
    await assertNoA11yViolations(container);
  });

  it('null score state has no axe violations', async () => {
    const { container } = render(
      <ReputationProfile name="Legacy User" score={null} history={[]} />
    );
    await assertNoA11yViolations(container);
  });
});
