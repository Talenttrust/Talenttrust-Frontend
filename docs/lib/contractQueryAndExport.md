# Escrow Query, Export & Optimistic Helpers

Pure library modules for filtering, sorting, paginating, exporting, and optimistically updating escrow contracts.

## File Locations

- Query filtering, sorting & pagination: `src/lib/contractQuery.ts` (`src/lib/__tests__/contractQuery.test.ts`)
- CSV formatting & formula sanitization: `src/lib/csv.ts` (`src/lib/__tests__/csv.test.ts`)
- Escrow & milestone CSV export: `src/lib/exportContracts.ts` (`src/lib/__tests__/exportContracts.test.ts`)
- Optimistic deposit & release reducers: `src/lib/optimistic.ts` (`src/lib/optimistic.test.ts`)
- Statement reconciliation ledger: `src/lib/statement.ts` (`src/lib/statement.test.ts`)

---

## `contractQuery` (`src/lib/contractQuery.ts`)

Parses and serializes URL search parameters (`?status=`, `?q=`, `?sort=`, `?page=`) and filters/sorts/paginates `EscrowContract[]` lists (`PAGE_SIZE = 10`).

- `STATUSES`: `['Created', 'Funded', 'Completed', 'Disputed', 'Resolved', 'Cancelled']`
- `SORTS`: `{ newest: 'Newest', oldest: 'Oldest', total: 'Largest total', escrow: 'Most in escrow' }`
- `parseQuery(params)` / `toSearchParams(query)`
- `filterContracts(list, query)` — case-insensitive match across `title`, `id`, `client`, and `freelancer`, ordered by `query.sort`.
- `applyQuery(list, query)` — returns `{ items, total, page, pageCount, from, to }`.

---

## `exportContracts` & `csv` (`src/lib/exportContracts.ts`, `src/lib/csv.ts`)

- `sanitizeCell(value)` — prefixes string cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` with a single quote (`'`) to prevent spreadsheet formula injection while keeping negative numbers numeric.
- `toCsv(headers, rows)` — RFC 4180 CRLF-delimited CSV serializer.
- `buildExport(kind, contracts)` — builds CSV content for `'escrows'` (`CONTRACT_HEADERS`) or `'milestones'` (`MILESTONE_HEADERS`).
- `exportFilename(date?)` — returns `talenttrust-escrows-YYYY-MM-DD.csv`.
- `downloadCsv(csv, filename)` — prepends a UTF-8 BOM (`\uFEFF`) and triggers a browser file download.

---

## `optimistic` (`src/lib/optimistic.ts`)

Pure state transitions backing `useOptimistic(contracts, contractsReducer)` in `EscrowDashboard`:

- `applyDeposit(contract, amount)` — increments `fundedAmount` and transitions `status` to `'Funded'` once `fundedAmount >= totalAmount`.
- `applyRelease(contract, index)` — marks `milestones[index].released = true`, increments `releasedAmount`, and transitions `status` to `'Completed'` when all milestones are released.
- `contractsReducer(state, action)` — applies an `OptimisticAction` (`'deposit'` or `'release'`) to the matching contract in a list.

---

## `statement` (`src/lib/statement.ts`)

Builds the reconciliation ledger rendered by `/contracts/[id]/statement` (`src/app/contracts/[id]/statement/page.tsx`):

- `buildStatement(contract)` — produces `Statement` with itemized `LedgerLine[]` and `totals` (`total`, `toFreelancer`, `toClient`, `held`) that always sum to `contract.totalAmount`.
- `isTerminalStatus(status)` — returns `true` for `'Completed'`, `'Resolved'`, and `'Cancelled'`.
- `ledgerSum(statement)` — sums all line amounts.
