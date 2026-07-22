# Requirements Document

## Introduction

This feature adds a search-and-sort toolbar to the `MilestonesList` component in the TalentTrust Frontend. The toolbar renders a labelled text input and a labelled sort select above the existing milestones list, allowing users to filter milestones by title and sort them by due date or payout. All filtering and sorting operates on derived local state; the incoming `milestones` prop is never mutated. The existing heading, total count indicator, scroll container, `StatusBadge`, and `formatAmount` rendering are fully preserved.

An optional `MilestoneToolbar` sub-component may be extracted to `src/components/milestones/MilestoneToolbar.tsx` to keep the parent component focused.

## Glossary

- **MilestonesList**: The React component at `src/components/MilestonesList.tsx` that renders the milestones panel.
- **MilestoneToolbar**: An optional presentational sub-component at `src/components/milestones/MilestoneToolbar.tsx` that renders the search input and sort select.
- **Milestone**: A data record with fields `id`, `title`, `status`, `payout`, `currency`, and optional `dueDate`.
- **Search_Query**: The current value of the search text input, used to filter milestones by title.
- **Sort_Key**: The currently selected sort option, one of `none`, `dueDate_asc`, `dueDate_desc`, `payout_asc`, or `payout_desc`.
- **Derived_List**: The read-only array of `Milestone` objects produced by applying the Search_Query filter and Sort_Key sort to the incoming `milestones` prop.
- **Filter_Helper**: A pure function that accepts an array of `Milestone` objects and a Search_Query string and returns a new filtered array.
- **Sort_Helper**: A pure function that accepts an array of `Milestone` objects and a Sort_Key and returns a new sorted array without modifying the input.
- **Live_Region**: An `aria-live="polite"` `aria-atomic="true"` element that announces the current result count to screen readers after every filter or sort change.
- **Empty_State**: The message displayed when the Derived_List contains zero items.

---

## Requirements

### Requirement 1: Search Input

**User Story:** As a user, I want to type a search query into a labelled text input, so that I can quickly narrow the milestones list to items whose title matches my query.

#### Acceptance Criteria

1. THE MilestonesList SHALL render a visible `<label>` element whose `htmlFor` attribute matches the `id` of the search `<input>` element, and that label SHALL NOT be hidden via `aria-hidden`, `display: none`, `visibility: hidden`, or `opacity: 0`.
2. WHEN the user types a non-empty, non-whitespace-only string (trimmed length > 0, max 200 characters) into the search input, THE MilestonesList SHALL display only the milestones whose `title` contains the trimmed query string, evaluated case-insensitively.
3. WHEN the search input is empty or contains only whitespace characters, THE MilestonesList SHALL display all milestones passed in the `milestones` prop.
4. WHEN the search input value changes, THE MilestonesList SHALL compute the filtered list without mutating the original `milestones` array (the original array reference and its elements SHALL remain unchanged after any filter operation).
5. THE search `<input>` SHALL be reachable and operable via keyboard alone: it SHALL receive focus when the user presses Tab to navigate to it, and it SHALL accept and reflect typed characters without requiring a pointing device.
6. WHEN the search query produces zero matching milestones, THE MilestonesList SHALL render the Empty_State message "No matches found" in place of the milestone list, and the Live_Region SHALL simultaneously announce "0 results shown".

### Requirement 2: Sort Select

**User Story:** As a user, I want to choose a sort order from a labelled dropdown, so that I can view milestones arranged by due date or payout in ascending or descending order.

#### Acceptance Criteria

1. THE MilestonesList SHALL render a visible `<label>` element whose `htmlFor` attribute matches the `id` of the sort `<select>` element, and that label SHALL NOT be hidden via `aria-hidden`, `display: none`, `visibility: hidden`, or `opacity: 0`.
2. THE sort `<select>` SHALL expose a default option with visible text "Default" (value `""` or `"none"`) plus exactly four additional options: "Due Date (Ascending)" (value `dueDate_asc`), "Due Date (Descending)" (value `dueDate_desc`), "Payout (Ascending)" (value `payout_asc`), and "Payout (Descending)" (value `payout_desc`).
3. IF no sort option other than the default has been selected, THE MilestonesList SHALL display milestones in the same order as the incoming `milestones` prop (insertion order).
4. WHEN the user selects "Due Date (Ascending)", THE Sort_Helper SHALL sort the Derived_List by parsing each `dueDate` string as a `Date` object, placing milestones with earlier dates first; milestones whose `dueDate` is `undefined` SHALL appear after all dated milestones.
5. WHEN the user selects "Due Date (Descending)", THE Sort_Helper SHALL sort the Derived_List by parsing each `dueDate` string as a `Date` object, placing milestones with later dates first; milestones whose `dueDate` is `undefined` SHALL appear after all dated milestones.
6. WHEN the user selects "Payout (Ascending)", THE Sort_Helper SHALL sort the Derived_List so that milestones with lower numeric `payout` values appear first.
7. WHEN the user selects "Payout (Descending)", THE Sort_Helper SHALL sort the Derived_List so that milestones with higher numeric `payout` values appear first.
8. WHEN the Sort_Helper sorts the Derived_List, THE Sort_Helper SHALL spread the input array into a new array before calling `.sort()`, leaving the input array's order and element references unchanged.
9. WHEN two milestones have equal sort key values (equal parsed `dueDate` or equal `payout`), THE Sort_Helper SHALL preserve their relative order from the input array (stable sort behaviour).
10. THE sort `<select>` SHALL be reachable and operable via keyboard alone: it SHALL receive focus when the user presses Tab and SHALL accept selection changes via arrow keys and Enter without requiring a pointing device.

### Requirement 3: Accessibility

**User Story:** As a keyboard or screen-reader user, I want all toolbar controls to be properly labelled and announced, so that I can search and sort milestones without relying on a mouse or visual cues.

#### Acceptance Criteria

1. THE MilestonesList SHALL include a Live_Region element with `aria-live="polite"` and `aria-atomic="true"` that is present in the DOM at initial render; its initial text content SHALL be an empty string.
2. WHEN the Derived_List changes as a result of a search or sort action, THE Live_Region SHALL update its text content to announce the number of results in the format `"{n} result{s} shown"` where `s` is `"s"` when `n ≠ 1` and `""` when `n = 1`, including when `n = 0`.
3. WHEN the Derived_List is empty, THE MilestonesList SHALL render the Empty_State message "No matches found" inside the scroll container, and THE Live_Region text content SHALL be "0 results shown".
4. THE search input and sort select SHALL each have a programmatically associated `<label>` that is visible to sighted users and not concealed via `aria-hidden`, `display: none`, `visibility: hidden`, or `opacity: 0`.
5. THE MilestonesList SHALL preserve the existing `aria-labelledby="milestones-title"` attribute on the enclosing `<section>` element at all times, regardless of search or sort state.
6. THE Live_Region SHALL be visually hidden from the page layout (e.g., using a screen-reader-only CSS utility class such as `sr-only`) so that the announcement text does not appear as visible page content.

### Requirement 4: Pure Presentational Constraint

**User Story:** As a developer, I want the search and sort logic to operate on derived state only, so that the parent component's data is not mutated and re-renders remain predictable.

#### Acceptance Criteria

1. WHEN the Filter_Helper is invoked with a `milestones` array and a `query` string, THE Filter_Helper SHALL return a new array containing only the milestones whose `title` (converted to lower case) includes the `query` string (converted to lower case), using `String.prototype.includes`, without mutating the input array.
2. WHEN the Sort_Helper is invoked with a `milestones` array and a Sort_Key, THE Sort_Helper SHALL return a new array produced by spreading the input array before calling `.sort()`, leaving the input array's element order unchanged.
3. WHEN the Sort_Helper is invoked with Sort_Key `none` (or the empty-string default), THE Sort_Helper SHALL return a new array with the same element order as the input array.
4. THE MilestonesList SHALL compute the Derived_List on every render by passing the `milestones` prop first through the Filter_Helper and then through the Sort_Helper, without assigning any intermediate result back to the `milestones` prop or any ref that persists across renders as a mutation.
5. THE `<span>` that displays the total count SHALL reflect the `.length` of the original `milestones` prop, not the `.length` of the Derived_List.
6. WHEN the MilestonesList re-renders due to a search or sort change, THE MilestonesList SHALL continue to render the existing `<h2>` with `id="milestones-title"`, the scroll container `<div>`, each matching `<article>` milestone card containing a `StatusBadge` and the `formatAmount`-formatted payout string.

### Requirement 5: Documentation

**User Story:** As a developer, I want JSDoc comments on the helper functions and a markdown component doc, so that I can understand and maintain the search and sort logic without reading the full implementation.

#### Acceptance Criteria

1. THE Filter_Helper function definition SHALL include a JSDoc block containing at minimum: a `@param` tag for the `milestones` array, a `@param` tag for the `query` string, a `@returns` tag describing the new filtered array, and an `@example` tag demonstrating case-insensitive usage; the block SHALL explicitly state that matching is case-insensitive via `toLowerCase()`.
2. THE Sort_Helper function definition SHALL include a JSDoc block containing at minimum: a `@param` tag for the `milestones` array, a `@param` tag for the Sort_Key, a `@returns` tag describing the new sorted array, and an `@example` tag; the block SHALL explicitly state that the original array is not mutated.
3. THE repository SHALL include a markdown file at `docs/components/MilestonesList.md` containing: (a) a Props table listing `milestones` with its type and description; (b) a section describing the search behaviour, including the case-insensitive partial-match rule; (c) a section describing the sort options and the `undefined` dueDate placement rule; (d) an Accessibility section noting the `aria-live` region and label associations; and (e) at least one TSX usage example showing the component with sample milestone data.

### Requirement 6: Test Coverage

**User Story:** As a developer, I want the test suite for `MilestonesList` to cover the search and sort toolbar at ≥95% module coverage, so that regressions are caught automatically.

#### Acceptance Criteria

1. THE test suite at `src/components/__tests__/MilestonesList.test.tsx` SHALL include a test that types a partial, mixed-case query into the search input, asserts that only matching milestone titles are present in the document, and asserts that non-matching milestone titles are absent from the document.
2. THE test suite SHALL include a test that clears the search input (or leaves it empty) and asserts that all milestone titles from the prop are present in the document.
3. THE test suite SHALL include four separate tests — one per sort option — each of which: selects the corresponding option from the sort select, retrieves all rendered milestone title elements in DOM order, and asserts their text content matches the expected sorted sequence.
4. THE test suite SHALL include a test that types a query that matches no milestones and asserts that the text "No matches found" is present in the document.
5. THE test suite SHALL include a test that types a query into the search input, then reads the text content of the element with `aria-live="polite"`, and asserts it equals `"{n} results shown"` (or `"1 result shown"` for a single match), where `n` is the number of matching milestones.
6. THE test suite SHALL include a test that provides two milestones with identical `payout` values, selects "Payout (Ascending)" from the sort select, and asserts that both milestone titles are present in the document.
7. THE test suite SHALL include a test that provides two milestones with identical `dueDate` strings, selects "Due Date (Ascending)" from the sort select, and asserts that both milestone titles are present in the document.
8. THE test suite SHALL include a test that provides a single milestone, renders `MilestonesList`, and asserts that the element with `aria-live="polite"` contains the text "1 result shown" (no trailing "s") after the initial render or after any search/sort interaction.
9. THE `jest.config.js` (or `package.json` Jest configuration) SHALL include a `coverageThreshold` entry for `src/components/MilestonesList.tsx` requiring at minimum 95% statements, 95% branches, and 95% functions; the CI pipeline SHALL execute `jest --coverage` such that the build fails if this threshold is not met.
