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
 *   7. Accessible labelling & sr-only structure
 *   8. Default prop values
 *   9. Accessibility – jest-axe audit (issue #135 req.)
 *  10. Semantic ordered list & <time> element (issue #246)
 *       – history renders as <ol> not <ul>
 *       – each date is wrapped in a <time> element
 *       – valid ISO dates get a machine-readable dateTime attribute
 *       – non-parseable date strings omit the dateTime attribute
 *       – empty history shows no list at all
 *
 * Accessibility assertions follow the aria-labelledby contracts expressed in
 * the component source and are verified via jest-axe for the full-history
 * state (as required by issue #135).
 *
 * Types are imported from the component itself – no duplicates.
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ReputationProfile, {
  ReputationEvent,
  ReputationProfileProps,
} from './ReputationProfile';
import { assertNoA11yViolations } from '@/test-utils/a11y';

jest.mock('./toast/toast-provider', () => ({
  useToast: () => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
    dismissToast: jest.fn(),
    toasts: [],
  }),
}));

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
// syncUrl is off here so unit tests stay isolated from next/navigation URL writes.
function renderProfile(props: ReputationProfileProps) {
  return render(<ReputationProfile syncUrl={false} {...props} />);
}

function getLevelText() {
  const levelBlock = document.querySelector('[aria-labelledby="reputation-level-label"]');
  return levelBlock?.textContent?.replace('Level', '').trim() ?? '';
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
    expect(getLevelText()).toBe('Newcomer');
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
    expect(getLevelText()).toBe('Active Member');
  });

  it('does NOT render history list items', () => {
    expect(document.querySelector('ol')).toBeNull();
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
    expect(getLevelText()).toBe('Trusted Contributor');
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
    const ol = document.querySelector('ol');
    const items = ol ? within(ol).getAllByRole('listitem') : [];
    expect(items).toHaveLength(HISTORY_EVENTS.length);
  });

  it('renders each event type label', () => {
    const ol = document.querySelector('ol');
    const items = ol ? within(ol).getAllByRole('listitem') : [];
    HISTORY_EVENTS.forEach((ev, idx) => {
      expect(within(items[idx]).getByText(ev.type)).toBeInTheDocument();
    });
  });

  it('renders each event summary', () => {
    HISTORY_EVENTS.forEach((ev) => {
      expect(screen.getByText(ev.summary)).toBeInTheDocument();
    });
  });

  it('renders each event date', () => {
    const ol = document.querySelector('ol');
    HISTORY_EVENTS.forEach((ev) => {
      expect(within(ol!).getByText(ev.date)).toBeInTheDocument();
    });
  });

  it('renders events newest-first by default (matching history array order)', () => {
    const ol = document.querySelector('ol');
    const items = ol ? within(ol).getAllByRole('listitem') : [];
    HISTORY_EVENTS.forEach((ev, idx) => {
      expect(within(items[idx]).getByText(ev.summary)).toBeInTheDocument();
    });
  });

  it('selects all reputation items from the bulk toolbar', () => {
    fireEvent.click(screen.getByRole('checkbox', { name: /select all reputation items/i }));

    HISTORY_EVENTS.forEach((event) => {
      expect(
        screen.getByRole('checkbox', {
          name: `Select reputation item ${event.type}: ${event.summary}`,
        }),
      ).toBeChecked();
    });
  });

  it('supports partial selection and bulk clear', () => {
    fireEvent.click(screen.getByRole('checkbox', {
      name: `Select reputation item ${HISTORY_EVENTS[0].type}: ${HISTORY_EVENTS[0].summary}`,
    }));

    expect(
      screen.getByRole('checkbox', {
        name: `Select reputation item ${HISTORY_EVENTS[0].type}: ${HISTORY_EVENTS[0].summary}`,
      }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /select all reputation items/i }),
    ).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(
      screen.getByRole('checkbox', {
        name: `Select reputation item ${HISTORY_EVENTS[0].type}: ${HISTORY_EVENTS[0].summary}`,
      }),
    ).not.toBeChecked();
  });

  it('confirms destructive bulk delete and clears the selected rows', async () => {
    fireEvent.click(screen.getByRole('checkbox', {
      name: /select all reputation items/i,
    }));

    fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));

    expect(
      screen.getByRole('alertdialog', { name: /delete selected reputation items\?/i }),
    ).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('alertdialog', { name: /delete selected reputation items\?/i })).getByRole('button', { name: /delete selected/i }));

    expect(await screen.findByText(/Deleted 3 reputation items\./i)).toBeInTheDocument();
    expect(screen.getByText(/No reputation history available yet\./i)).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox', { name: /select reputation item/i })).toHaveLength(0);
  });

  it('announces export results for a partial bulk selection', async () => {
    fireEvent.click(screen.getByRole('checkbox', {
      name: `Select reputation item ${HISTORY_EVENTS[0].type}: ${HISTORY_EVENTS[0].summary}`,
    }));
    fireEvent.click(screen.getByRole('checkbox', {
      name: `Select reputation item ${HISTORY_EVENTS[1].type}: ${HISTORY_EVENTS[1].summary}`,
    }));
    fireEvent.click(screen.getByRole('button', { name: /export selected/i }));

    expect(await screen.findByText(/Exported 2 reputation items\./i)).toBeInTheDocument();
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
    const srSpans = screen.getAllByText(/Reputation score/i);
    // At least one sr-only span should exist.
    const srOnlySpan = srSpans.find((el) => el.classList.contains('sr-only'));
    expect(srOnlySpan).toBeDefined();
  });

it('sr-only span announces "out of {maxScore}" after the numeric score', () => {
     renderProfile({ name: 'SR Out User', score: 77, maxScore: 10, history: [] });
     const outOf10 = screen.getAllByText(/out of 10/i);
     const srOnlySpan = outOf10.find((el) => el.classList.contains('sr-only'));
     expect(srOnlySpan).toBeDefined();
   });

   it('sr-only span announces "out of 5" (default) after the numeric score', () => {
     renderProfile({ name: 'SR Out Default User', score: 77, history: [] });
     const outOf5 = screen.getAllByText(/out of 5/i);
     const srOnlySpan = outOf5.find((el) => el.classList.contains('sr-only'));
     expect(srOnlySpan).toBeDefined();
   });

  it('sr-only span announces "Level " before the level text when score exists', () => {
    renderProfile({ name: 'SR Level User', score: 77, level: 'Expert', history: [] });
    const levelSpans = screen.getAllByText(/^Level$/i);
    const srOnlySpan = levelSpans.find((el) => el.classList.contains('sr-only'));
    expect(srOnlySpan).toBeDefined();
  });

  it('groups bulk reputation actions in a toolbar with descriptive labels', () => {
    renderProfile({ name: 'Toolbar User', score: 80, history: HISTORY_EVENTS });

    const toolbar = screen.getByRole('toolbar', { name: /reputation history actions/i });
    expect(toolbar).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /export selected reputation items/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete selected reputation items/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear selected reputation items/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. Default prop values
// ---------------------------------------------------------------------------

describe('ReputationProfile – default prop values', () => {
  it('derives level from score when level is not provided', () => {
    renderProfile({ name: 'Default User', score: 3 });
    expect(getLevelText()).toBe('Trusted Partner');
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

// ---------------------------------------------------------------------------
// 10. Semantic ordered list & <time> element (issue #246)
// ---------------------------------------------------------------------------

describe('ReputationProfile – ordered list semantics (issue #246)', () => {
  /**
   * Scenario: History renders as <ol>, not <ul>.
   * Reputation history is inherently chronological, so the list must be
   * ordered to convey sequential meaning to assistive technologies.
   */
  it('renders the history as an ordered list (<ol>) when events are present', () => {
    const { container } = renderProfile({
      name: 'Ordered List User',
      score: 80,
      history: HISTORY_EVENTS,
    });
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    const historyHeading = screen.getByRole('heading', { name: /reputation history/i });
    const historySection = historyHeading.closest('div');
    const ul = historySection ? historySection.querySelector('ul') : null;
    expect(ul).toBeNull();
  });

  /**
   * Scenario: Each event date is rendered inside a <time> element.
   * The <time> element communicates a machine-readable date to browsers,
   * search engines, and assistive technologies.
   */
  it('wraps each event date in a <time> element', () => {
    const { container } = renderProfile({
      name: 'Time Element User',
      score: 80,
      history: HISTORY_EVENTS,
    });
    const timeEls = container.querySelectorAll('time');
    expect(timeEls).toHaveLength(HISTORY_EVENTS.length);
  });

  /**
   * Scenario: Valid ISO date strings get a machine-readable dateTime attribute.
   * The dateTime attribute value must equal the raw date string.
   */
  it('sets dateTime attribute equal to the ISO date string for valid dates', () => {
    const { container } = renderProfile({
      name: 'DateTime Attr User',
      score: 80,
      history: HISTORY_EVENTS,
    });
    const timeEls = container.querySelectorAll('time');
    HISTORY_EVENTS.forEach((ev, idx) => {
      expect(timeEls[idx].getAttribute('dateTime')).toBe(ev.date);
    });
  });

  /**
   * Scenario: A non-parseable date string omits the dateTime attribute.
   * Emitting an invalid dateTime value would produce invalid HTML, so
   * the attribute should be absent when the date cannot be parsed.
   */
  it('omits dateTime attribute when event.date is not a parseable date', () => {
    const invalidDateEvent: ReputationEvent = {
      id: 'ev-bad',
      type: 'Unknown',
      summary: 'Event with unparseable date',
      date: 'not-a-date',
    };
    const { container } = renderProfile({
      name: 'Invalid Date User',
      score: 80,
      history: [invalidDateEvent],
    });
    const timeEl = container.querySelector('time');
    expect(timeEl).not.toBeNull();
    // The visible text should still be shown
    expect(timeEl?.textContent).toBe('not-a-date');
    // But dateTime attribute must NOT be set
    expect(timeEl?.hasAttribute('dateTime')).toBe(false);
  });

  /**
   * Scenario: The <time> element contains the human-readable date text.
   * The text content of each <time> must match the event.date string.
   */
  it('renders each event date as the text content of its <time> element', () => {
    const { container } = renderProfile({
      name: 'Time Text User',
      score: 80,
      history: HISTORY_EVENTS,
    });
    const timeEls = container.querySelectorAll('time');
    HISTORY_EVENTS.forEach((ev, idx) => {
      expect(timeEls[idx].textContent).toBe(ev.date);
    });
  });

  /**
   * Scenario: Empty history shows no list at all — no <ol>, no <ul>.
   * When history is empty, the empty-state message is shown instead.
   */
  it('renders no ordered list when history is empty', () => {
    const { container } = renderProfile({
      name: 'Empty History User',
      history: [],
    });
    expect(container.querySelector('ol')).toBeNull();
    expect(container.querySelector('ul')).toBeNull();
    expect(
      screen.getByText(/No reputation history available yet\./i)
    ).toBeInTheDocument();
  });

  /**
   * Scenario: "Private by default" pill appears when history is empty.
   * This preserves the existing presentation for the empty-history path.
   */
  it('shows "Private by default" pill when history is empty', () => {
    renderProfile({ name: 'Private User', history: [] });
    expect(screen.getByText(/Private by default/i)).toBeInTheDocument();
  });

  /**
   * Scenario: List items inside <ol> are still individually selectable.
   * Confirms that the <li> children carry the correct implicit role.
   */
  it('renders a list item role for each event inside the ordered list', () => {
    renderProfile({
      name: 'Listitem Role User',
      score: 80,
      history: HISTORY_EVENTS,
    });
    const ol = document.querySelector('ol');
    const items = ol ? within(ol).getAllByRole('listitem') : [];
    expect(items).toHaveLength(HISTORY_EVENTS.length);
  });

/**
    * Scenario: axe accessibility audit passes with the new <ol> + <time> structure.
    * This confirms no new a11y violations are introduced by the semantic change.
    */
   it('full-history state with <ol> and <time> has no axe violations', async () => {
     const { container } = render(
       <ReputationProfile
         name="A11y Ol Time User"
         score={90}
         level="Expert"
         history={HISTORY_EVENTS}
       />
     );
     await assertNoA11yViolations(container);
   });
 });

// ---------------------------------------------------------------------------
// 11. Meter semantics for reputation score (issue #245)
// ---------------------------------------------------------------------------

describe('ReputationProfile – reputation score meter (issue #245)', () => {
   it('renders a meter role when score is present', () => {
     renderProfile({ name: 'Meter User', score: 88, history: HISTORY_EVENTS });
     const meter = screen.getByRole('meter');
     expect(meter).toBeInTheDocument();
   });

   it('meter has aria-valuenow set to the score value', () => {
     renderProfile({ name: 'Meter Value User', score: 75, history: HISTORY_EVENTS });
     const meter = screen.getByRole('meter');
     expect(meter).toHaveAttribute('aria-valuenow', '75');
   });

   it('meter has aria-valuemin set to 0', () => {
     renderProfile({ name: 'Meter Min User', score: 50, history: HISTORY_EVENTS });
     const meter = screen.getByRole('meter');
     expect(meter).toHaveAttribute('aria-valuemin', '0');
   });

   it('meter has aria-valuemax set to maxScore prop (default 5)', () => {
     renderProfile({ name: 'Meter Max Default User', score: 4, history: HISTORY_EVENTS });
     const meter = screen.getByRole('meter');
     expect(meter).toHaveAttribute('aria-valuemax', '5');
   });

   it('meter has aria-valuemax set to custom maxScore when provided', () => {
     renderProfile({ name: 'Meter Max Custom User', score: 42, maxScore: 100, history: HISTORY_EVENTS });
     const meter = screen.getByRole('meter');
     expect(meter).toHaveAttribute('aria-valuemax', '100');
   });

   it('does NOT render a meter role when score is absent', () => {
     renderProfile({ name: 'No Meter User', history: [] });
     expect(screen.queryByRole('meter')).not.toBeInTheDocument();
   });

   it('does NOT render a meter role when score is null', () => {
     renderProfile({ name: 'No Meter Null User', score: null, history: [] });
     expect(screen.queryByRole('meter')).not.toBeInTheDocument();
   });

   it('meter renders at min value (score 0)', () => {
     renderProfile({ name: 'Meter Min Value User', score: 0, maxScore: 5, history: HISTORY_EVENTS });
     const meter = screen.getByRole('meter');
     expect(meter).toHaveAttribute('aria-valuenow', '0');
     expect(meter).toHaveAttribute('aria-valuemin', '0');
     expect(meter).toHaveAttribute('aria-valuemax', '5');
   });

   it('meter renders at max value (score equals maxScore)', () => {
     renderProfile({ name: 'Meter Max Value User', score: 5, maxScore: 5, history: HISTORY_EVENTS });
     const meter = screen.getByRole('meter');
     expect(meter).toHaveAttribute('aria-valuenow', '5');
     expect(meter).toHaveAttribute('aria-valuemax', '5');
   });

   it('meter has an accessible name via aria-labelledby', () => {
     renderProfile({ name: 'Meter A11y User', score: 88, history: HISTORY_EVENTS });
     const meter = screen.getByRole('meter');
     expect(meter).toHaveAttribute('aria-labelledby', 'reputation-score-label');
   });

   it('meter axe audit passes for score-present state', async () => {
     const { container } = render(
       <ReputationProfile
         name="Meter A11y Verified User"
         score={88}
         level="Trusted Contributor"
         history={HISTORY_EVENTS}
       />
     );
     await assertNoA11yViolations(container);
   });

    it('meter axe audit passes for score-null state', async () => {
      const { container } = render(
        <ReputationProfile name="Meter A11y Guest User" score={null} history={[]} />
      );
      await assertNoA11yViolations(container);
    });
  });

  describe('ReputationProfile – high-contrast theme tokens (a11y/reputation-31)', () => {
  const THEME_HISTORY: ReputationEvent[] = [
    { id: 'ev-1', type: 'Verification', summary: 'Completed identity verification', date: '2026-04-24' },
  ];

  it('uses CSS variable tokens for card backgrounds instead of fixed bg-white', () => {
    const { container } = renderProfile({
      name: 'Token User',
      score: 50,
      history: THEME_HISTORY,
    });
    const cards = container.querySelectorAll('.rounded-3xl.border');
    cards.forEach((card) => {
      const cls = card.className;
      expect(cls).not.toMatch(/\bbg-white\b/);
      expect(cls).toMatch(/var\(--card\)/);
    });
  });

  it('uses CSS variable tokens for surface backgrounds instead of fixed bg-slate-50', () => {
    const { container } = renderProfile({
      name: 'Surface User',
      score: 50,
      history: THEME_HISTORY,
    });
    const surfaceElements = container.querySelectorAll('.rounded-3xl.border\\[var\\(--border\\)\\]');
    surfaceElements.forEach((el) => {
      const cls = el.className;
      expect(cls).not.toMatch(/bg-slate-\d+/);
    });
  });

  it('uses CSS variable tokens for text instead of fixed text-slate-*', () => {
    const { container } = renderProfile({
      name: 'Text Token User',
      score: 50,
      history: THEME_HISTORY,
    });
    // Headings should use var(--foreground)
    const headings = container.querySelectorAll('h1, h2');
    headings.forEach((h) => {
      const cls = h.className;
      if (cls.includes('sr-only')) return;
      expect(cls).not.toMatch(/text-slate-\d+/);
    });
    // Labels should use var(--muted-foreground)
    const labels = container.querySelectorAll('#reputation-score-label, #reputation-level-label');
    labels.forEach((label) => {
      expect(label.className).not.toMatch(/text-slate-\d+/);
    });
  });

  it('uses CSS variable tokens for borders instead of fixed border-slate-200', () => {
    const { container } = renderProfile({
      name: 'Border User',
      score: 50,
      history: THEME_HISTORY,
    });
    const bordered = container.querySelectorAll('.border');
    bordered.forEach((el) => {
      const cls = el.className;
      if (cls.includes('border-t')) return;
      if (cls.includes('rounded-full')) return;
      expect(cls).not.toMatch(/\bborder-slate-200\b/);
    });
  });

  it('uses theme-aware tokens for the amber partial-data banner', () => {
    renderProfile({
      name: 'Amber Banner User',
      score: 50,
      history: [],
    });
    const warningBanner = screen.getByText(/Partial reputation data/i).closest('div');
    expect(warningBanner).not.toBeNull();
    expect(warningBanner!.className).toMatch(/var\(--status-warning/);
  });

  it('uses theme-aware tokens for active legend band', () => {
    renderProfile({
      name: 'Legend Active User',
      score: 3.5,
      history: [],
    });
    const legendList = document.getElementById('reputation-legend');
    expect(legendList).not.toBeNull();
    const items = legendList!.querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
    // At least one item should be active with var(--legend-active*) tokens
    const activeItems = Array.from(items).filter(
      (item) => item.className.includes('var(--legend-active')
    );
    expect(activeItems.length).toBe(1);
  });

  it('uses theme-aware tokens for inactive legend bands', () => {
    renderProfile({
      name: 'Legend Inactive User',
      score: 0,
      history: [],
    });
    const legendList = document.getElementById('reputation-legend');
    expect(legendList).not.toBeNull();
    const items = legendList!.querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
    // Items that are not active should use var(--border) and var(--muted-foreground)
    const inactiveItems = Array.from(items).filter(
      (item) => !item.className.includes('var(--legend-active')
    );
    expect(inactiveItems.length).toBe(items.length - 1);
    inactiveItems.forEach((item) => {
      expect(item.className).toMatch(/var\(--border\)/);
    });
  });

  it('avatar uses var(--foreground) background with var(--background) text', () => {
    renderProfile({
      name: 'Avatar User',
      score: 50,
      history: THEME_HISTORY,
    });
    const avatar = screen.getByText('A', { selector: 'div' });
    expect(avatar).toBeInTheDocument();
    expect(avatar.className).toMatch(/var\(--foreground\)/);
    expect(avatar.className).toMatch(/var\(--background\)/);
  });

  it('legend band range text uses var(--muted-foreground)', () => {
    renderProfile({
      name: 'Legend Range User',
      score: 3.5,
      history: [],
    });
    const rangeText = document.querySelector('#reputation-legend li p.font-bold');
    expect(rangeText).not.toBeNull();
    expect(rangeText!.className).toMatch(/var\(--muted-foreground\)/);
  });
});

describe('reputation level legend and derived level', () => {
    it('does not render the legend when there is no score', () => {
      renderProfile({ name: 'No Score User', score: undefined });
      expect(screen.queryByText(/Reputation Level Legend/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('list', { name: /Reputation Level Legend/i })).not.toBeInTheDocument();
    });

    it('renders the legend when score exists', () => {
      renderProfile({ name: 'Score User', score: 3.5 });
      expect(screen.getByText(/Reputation Level Legend/i)).toBeInTheDocument();
      const legendList = screen.getByRole('list', { name: /Reputation Level Legend/i });
      expect(legendList).toBeInTheDocument();
      expect(within(legendList).getAllByRole('listitem')).toHaveLength(5);
    });

    it('associates the meter with the legend via aria-describedby', () => {
      renderProfile({ name: 'A11y User', score: 3.5 });
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('aria-describedby', 'reputation-legend');
    });

    it('honors the explicit level prop when provided', () => {
      renderProfile({ name: 'Explicit Level User', score: 4.5, level: 'Custom Legend Status' });
      expect(screen.getByText('Custom Legend Status')).toBeInTheDocument();
    });

    it('derives level from score when level is not provided (default maxScore = 5)', () => {
      // Band 1 [0, 1): Newcomer
      const { unmount } = renderProfile({ name: 'User 1', score: 0.5 });
      expect(getLevelText()).toBe('Newcomer');
      unmount();

      // Band 2 [1, 2): Contributor
      const { unmount: unmount2 } = renderProfile({ name: 'User 2', score: 1.5 });
      expect(getLevelText()).toBe('Contributor');
      unmount2();

      // Band 3 [2, 3): Active Contributor
      const { unmount: unmount3 } = renderProfile({ name: 'User 3', score: 2.5 });
      expect(getLevelText()).toBe('Active Contributor');
      unmount3();

      // Band 4 [3, 4): Trusted Partner
      const { unmount: unmount4 } = renderProfile({ name: 'User 4', score: 3.5 });
      expect(getLevelText()).toBe('Trusted Partner');
      unmount4();

      // Band 5 [4, 5]: Expert
      renderProfile({ name: 'User 5', score: 4.5 });
      expect(getLevelText()).toBe('Expert');
    });

    it('correctly maps scores at boundaries (default maxScore = 5)', () => {
      // Score exactly 0 -> Newcomer
      const { unmount: u0 } = renderProfile({ name: 'U0', score: 0 });
      expect(getLevelText()).toBe('Newcomer');
      u0();

      // Score exactly 1 -> Contributor
      const { unmount: u1 } = renderProfile({ name: 'U1', score: 1.0 });
      expect(getLevelText()).toBe('Contributor');
      u1();

      // Score exactly 2 -> Active Contributor
      const { unmount: u2 } = renderProfile({ name: 'U2', score: 2.0 });
      expect(getLevelText()).toBe('Active Contributor');
      u2();

      // Score exactly 3 -> Trusted Partner
      const { unmount: u3 } = renderProfile({ name: 'U3', score: 3.0 });
      expect(getLevelText()).toBe('Trusted Partner');
      u3();

      // Score exactly 4 -> Expert
      const { unmount: u4 } = renderProfile({ name: 'U4', score: 4.0 });
      expect(getLevelText()).toBe('Expert');
      u4();

      // Score exactly 5 -> Expert
      renderProfile({ name: 'U5', score: 5.0 });
      expect(getLevelText()).toBe('Expert');
    });

    it('handles custom maxScore scaling correctly', () => {
      // With custom maxScore = 10, the bands are:
      // [0, 2): Newcomer
      // [2, 4): Contributor
      // [4, 6): Active Contributor
      // [6, 8): Trusted Partner
      // [8, 10]: Expert
      renderProfile({ name: 'Scaled User', score: 7.0, maxScore: 10 });
      expect(getLevelText()).toBe('Trusted Partner');
    });

    it('passes axe accessibility checks when legend is rendered', async () => {
      const { container } = renderProfile({ name: 'A11y Legend User', score: 3.5 });
      await assertNoA11yViolations(container);
    });
  });

// ---------------------------------------------------------------------------
// 12. Last-updated timestamp indicator (issue #62)
// ---------------------------------------------------------------------------

/**
 * These tests use a fixed reference timestamp injected via the formatRelativeTime
 * module. Because the component calls formatRelativeTime(lastUpdated) at render
 * time using the real clock, we mock the module so that our assertions are
 * deterministic regardless of when the test suite runs.
 *
 * The mock lets individual tests return whatever relative string they need,
 * keeping every test self-contained and immune to wall-clock drift.
 */

jest.mock('@/lib/formatRelativeTime', () => ({
  formatRelativeTime: jest.fn(),
  toISOString: jest.fn(),
}));

// Pull in the mocked versions so individual tests can configure return values.
import { formatRelativeTime as mockFormatRelativeTime, toISOString as mockToISOString } from '@/lib/formatRelativeTime';
const mockFRT = mockFormatRelativeTime as jest.Mock;
const mockISO = mockToISOString as jest.Mock;

describe('ReputationProfile – last-updated timestamp (issue #62)', () => {
  const ISO_TS = '2026-07-27T11:55:00.000Z';

  beforeEach(() => {
    // Default: 5 minutes ago
    mockFRT.mockReturnValue('5 minutes ago');
    mockISO.mockReturnValue(ISO_TS);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ── Visibility ────────────────────────────────────────────────────────────

  it('renders the last-updated indicator when lastUpdated is provided', () => {
    renderProfile({ name: 'TS User', history: [], lastUpdated: ISO_TS });
    expect(screen.getByTestId('last-updated')).toBeInTheDocument();
  });

  it('does NOT render the indicator when lastUpdated is omitted', () => {
    renderProfile({ name: 'No TS User', history: [] });
    expect(screen.queryByTestId('last-updated')).not.toBeInTheDocument();
  });

  it('does NOT render the indicator when lastUpdated is null', () => {
    renderProfile({ name: 'Null TS User', history: [], lastUpdated: null });
    expect(screen.queryByTestId('last-updated')).not.toBeInTheDocument();
  });

  it('does NOT render the indicator when formatRelativeTime returns null', () => {
    mockFRT.mockReturnValue(null);
    renderProfile({ name: 'Invalid TS User', history: [], lastUpdated: 'bad-date' });
    expect(screen.queryByTestId('last-updated')).not.toBeInTheDocument();
  });

  // ── Relative text content ─────────────────────────────────────────────────

  it('displays the relative time string returned by formatRelativeTime', () => {
    renderProfile({ name: 'FRT User', history: [], lastUpdated: ISO_TS });
    expect(screen.getByTestId('last-updated')).toHaveTextContent('Updated 5 minutes ago');
  });

  it('displays "just now" when formatRelativeTime returns "just now"', () => {
    mockFRT.mockReturnValue('just now');
    renderProfile({ name: 'Just Now User', history: [], lastUpdated: ISO_TS });
    expect(screen.getByTestId('last-updated')).toHaveTextContent('Updated just now');
  });

  it('displays "2 hours ago" correctly', () => {
    mockFRT.mockReturnValue('2 hours ago');
    renderProfile({ name: 'Hours User', history: [], lastUpdated: ISO_TS });
    expect(screen.getByTestId('last-updated')).toHaveTextContent('Updated 2 hours ago');
  });

  it('displays "3 days ago" correctly', () => {
    mockFRT.mockReturnValue('3 days ago');
    renderProfile({ name: 'Days User', history: [], lastUpdated: ISO_TS });
    expect(screen.getByTestId('last-updated')).toHaveTextContent('Updated 3 days ago');
  });

  // ── <time> element & dateTime attribute ───────────────────────────────────

  it('wraps the relative time in a <time> element', () => {
    const { container } = renderProfile({ name: 'Time El User', history: [], lastUpdated: ISO_TS });
    // The last-updated paragraph contains exactly one <time> element.
    const p = container.querySelector('[data-testid="last-updated"]');
    expect(p?.querySelector('time')).not.toBeNull();
  });

  it('sets dateTime attribute on <time> to the ISO string from toISOString', () => {
    const { container } = renderProfile({ name: 'DateTime User', history: [], lastUpdated: ISO_TS });
    const timeEl = container.querySelector('[data-testid="last-updated"] time');
    expect(timeEl?.getAttribute('dateTime')).toBe(ISO_TS);
  });

  it('omits dateTime attribute when toISOString returns an empty string', () => {
    mockISO.mockReturnValue('');
    const { container } = renderProfile({ name: 'No DateTime User', history: [], lastUpdated: 'bad' });
    const timeEl = container.querySelector('[data-testid="last-updated"] time');
    // When isoTime is falsy, dateTime prop is undefined → attribute absent.
    expect(timeEl?.hasAttribute('dateTime')).toBe(false);
  });

  // ── Accessible label ──────────────────────────────────────────────────────

  it('the indicator paragraph has an aria-label containing the ISO timestamp', () => {
    renderProfile({ name: 'A11y TS User', history: [], lastUpdated: ISO_TS });
    const p = screen.getByTestId('last-updated');
    expect(p).toHaveAttribute('aria-label', `Last updated at ${ISO_TS}`);
  });

  it('aria-label falls back to "Last updated" when toISOString returns empty', () => {
    mockISO.mockReturnValue('');
    mockFRT.mockReturnValue('5 minutes ago');
    renderProfile({ name: 'Fallback A11y User', history: [], lastUpdated: 'bad' });
    const p = screen.getByTestId('last-updated');
    expect(p).toHaveAttribute('aria-label', 'Last updated');
  });

  // ── Works across all reputation states ───────────────────────────────────

  it('shows the indicator in the no-reputation state', () => {
    renderProfile({ name: 'No Score TS', history: [], lastUpdated: ISO_TS });
    expect(screen.getByTestId('last-updated')).toBeInTheDocument();
  });

  it('shows the indicator in the partial-reputation state', () => {
    renderProfile({ name: 'Partial TS', score: 3, history: [], lastUpdated: ISO_TS });
    expect(screen.getByTestId('last-updated')).toBeInTheDocument();
  });

  it('shows the indicator in the full-reputation state', () => {
    renderProfile({ name: 'Full TS', score: 4, history: HISTORY_EVENTS, lastUpdated: ISO_TS });
    expect(screen.getByTestId('last-updated')).toBeInTheDocument();
  });

  // ── Accessibility audit ───────────────────────────────────────────────────

  it('passes axe audit with lastUpdated present (full-reputation state)', async () => {
    mockFRT.mockReturnValue('5 minutes ago');
    mockISO.mockReturnValue(ISO_TS);
    const { container } = render(
      <ReputationProfile
        name="A11y TS Full"
        score={4}
        level="Expert"
        history={HISTORY_EVENTS}
        lastUpdated={ISO_TS}
      />
    );
    await assertNoA11yViolations(container);
  });

  it('passes axe audit with lastUpdated present (no-reputation state)', async () => {
    mockFRT.mockReturnValue('just now');
    mockISO.mockReturnValue(ISO_TS);
    const { container } = render(
      <ReputationProfile
        name="A11y TS None"
        history={[]}
        lastUpdated={ISO_TS}
      />
    );
    await assertNoA11yViolations(container);
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts for the selection toolbar (issue: keyboard shortcuts
// for reputation's primary actions)
// ---------------------------------------------------------------------------

describe('ReputationProfile – keyboard shortcuts for the selection toolbar', () => {
  const FULL_PROPS: ReputationProfileProps = {
    name: 'Verified User',
    score: 88,
    history: HISTORY_EVENTS,
  };

  function selectFirstTwo() {
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: `Select reputation item ${HISTORY_EVENTS[0].type}: ${HISTORY_EVENTS[0].summary}`,
      })
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: `Select reputation item ${HISTORY_EVENTS[1].type}: ${HISTORY_EVENTS[1].summary}`,
      })
    );
  }

  function exportButton() {
    return screen.getByRole('button', { name: /export selected reputation items/i });
  }
  function deleteButton() {
    return screen.getByRole('button', { name: /delete selected reputation items/i });
  }
  function clearButton() {
    return screen.getByRole('button', { name: /clear selected reputation items/i });
  }

  it('Escape clears the selection and disables the toolbar buttons', () => {
    renderProfile(FULL_PROPS);
    selectFirstTwo();
    expect(exportButton()).toBeEnabled();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(exportButton()).toBeDisabled();
    expect(deleteButton()).toBeDisabled();
    expect(clearButton()).toBeDisabled();
  });

  it('does nothing when Escape is pressed with no active selection', () => {
    renderProfile(FULL_PROPS);
    // No selection made; toolbar buttons already disabled — Escape should
    // be a harmless no-op rather than throwing or doing anything odd.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(exportButton()).toBeDisabled();
  });

  // Keydown is fired on the currently-focused element (not `document`) so
  // `event.target` matches what a real, bubbled browser event would carry —
  // firing directly on `document` would set target=document, which the
  // isInsideToolbar check would (correctly) treat as outside the toolbar.

  it('ArrowRight moves focus to the next toolbar button and wraps around', () => {
    renderProfile(FULL_PROPS);
    selectFirstTwo();

    exportButton().focus();
    fireEvent.keyDown(exportButton(), { key: 'ArrowRight' });
    expect(deleteButton()).toHaveFocus();

    fireEvent.keyDown(deleteButton(), { key: 'ArrowRight' });
    expect(clearButton()).toHaveFocus();

    fireEvent.keyDown(clearButton(), { key: 'ArrowRight' });
    expect(exportButton()).toHaveFocus();
  });

  it('ArrowLeft moves focus to the previous toolbar button and wraps around', () => {
    renderProfile(FULL_PROPS);
    selectFirstTwo();

    exportButton().focus();
    fireEvent.keyDown(exportButton(), { key: 'ArrowLeft' });
    expect(clearButton()).toHaveFocus();
  });

  it('Home and End jump to the first and last toolbar button', () => {
    renderProfile(FULL_PROPS);
    selectFirstTwo();

    deleteButton().focus();
    fireEvent.keyDown(deleteButton(), { key: 'End' });
    expect(clearButton()).toHaveFocus();

    fireEvent.keyDown(clearButton(), { key: 'Home' });
    expect(exportButton()).toHaveFocus();
  });

  it('arrow keys do nothing when focus is outside the toolbar', () => {
    renderProfile(FULL_PROPS);
    selectFirstTwo();

    const selectAll = screen.getByRole('checkbox', { name: 'Select all reputation items' });
    selectAll.focus();
    fireEvent.keyDown(selectAll, { key: 'ArrowRight' });

    expect(selectAll).toHaveFocus();
  });

  it('does not fire Escape while a select control has focus (respects input focus)', () => {
    renderProfile(FULL_PROPS);
    selectFirstTwo();

    const sortSelect = screen.getByTestId('reputation-sort-dir');
    sortSelect.focus();
    fireEvent.keyDown(sortSelect, { key: 'Escape' });

    // Selection must be untouched — the toolbar is still enabled.
    expect(exportButton()).toBeEnabled();
  });

  it('shows a discoverable Escape hint only once a selection is active', () => {
    renderProfile(FULL_PROPS);
    expect(screen.queryByText(/to clear selection/i)).not.toBeInTheDocument();

    selectFirstTwo();
    expect(screen.getByText(/to clear selection/i)).toBeInTheDocument();
  });

  it('removes the global keydown listener on unmount', () => {
    const { unmount } = renderProfile(FULL_PROPS);
    selectFirstTwo();
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
