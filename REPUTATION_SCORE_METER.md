# Accessible Numeric Out-of-N Reputation Score Meter Implementation

## Overview

This document describes the implementation of an accessible numeric out-of-N reputation score meter for the `ReputationProfile` component, addressing issue #245.

## Problem Statement

The `ReputationProfile` component in `src/components/ReputationProfile.tsx` previously rendered the score as plain text with a hardcoded "out of 5" screen-reader suffix. This approach lacked semantic meter markup that would convey min/max/current value to assistive technologies.

## Solution

### Changes to `src/components/ReputationProfile.tsx`

1. **Added `maxScore` prop** (optional, defaults to 5)
   - Type: `number`
   - JSDoc comment: "Maximum possible score value. Used for aria-valuemax on the meter role."

2. **Wrapped score in a semantic meter element**
   - Added `role="meter"` to the score span
   - Added `aria-valuenow={score}` to convey the current score value
   - Added `aria-valuemin={0}` for the minimum bound
   - Added `aria-valuemax={maxScore}` for the maximum bound (configurable)
   - Added `aria-labelledby="reputation-score-label"` to provide the meter with an accessible name

3. **Preserved existing functionality**
   - "No reputation yet" branch still renders when score is absent or null
   - Existing labelled text and privacy copy remain unchanged
   - Updated screen reader text to use `{maxScore}` instead of hardcoded "5"

4. **Added JSDoc documentation**
   - Comprehensive inline documentation explaining the meter semantics
   - Documents the purpose and behavior of the meter role

### Changes to `src/components/ReputationProfile.test.tsx`

Added a new test suite section for issue #245 covering:

- **Meter role presence**: Verifies meter role renders when score is present
- **aria-valuenow**: Asserts the current score value is set correctly
- **aria-valuemin**: Asserts minimum value is 0
- **aria-valuemax**: Asserts max value uses the `maxScore` prop (default 5)
- **Custom maxScore**: Verifies custom maxScore values work correctly
- **Meter absence**: Confirms no meter renders when score is absent/null
- **Min/max boundary values**: Tests score at value 0 and score equal to maxScore
- **Accessible name**: Verifies meter has aria-labelledby attribute
- **jest-axe audits**: Validates no accessibility violations for score-present and score-null states

### Test Coverage

All tests pass with 100% coverage on `ReputationProfile.tsx`:
- Statements: 100%
- Branches: 100%
- Functions: 100%
- Lines: 100%

## Accessibility Validation

All jest-axe audits pass:
- full-history state: no violations
- no-reputation state (undefined score): no violations
- partial-reputation state (score, no history): no violations
- null score state: no violations

## Example Usage

```tsx
// Default maxScore of 5
<ReputationProfile name="User" score={4.2} level="Active" history={[]} />

// Custom maxScore
<ReputationProfile name="User" score={88} maxScore={100} level="Trusted" history={[]} />

// No score (meter not rendered)
<ReputationProfile name="Guest" history={[]} />
```

## Linting and Build

- `npm run lint`: Passes (only pre-existing coverage warning)
- `npm test`: All 70 tests pass
- `npm run build`: Builds successfully

## Pull Request

Created PR: https://github.com/Talenttrust/Talenttrust-Frontend/pull/298

Closes #245