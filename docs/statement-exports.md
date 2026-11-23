# Escrow statement exports

The statement page at `/contracts/<id>/statement` offers **Download CSV** and
**Download JSON** alongside the existing Print / Save as PDF control. The
toolbar is hidden by the existing print stylesheet. Files are generated locally
from the same statement rendered on the page, without another API request,
wallet signing, or changing escrow state.

Filenames are `talenttrust-statement-<id>.csv` and
`talenttrust-statement-<id>.json`.

## CSV

`statementToCsv(statement)` uses the existing `toCsv` sanitizer. It escapes
quotes, commas and newlines and neutralizes spreadsheet formula prefixes in
text. Downloads retain the existing UTF-8 BOM for Excel. Numeric amounts remain
numbers in the original token units; exports do not re-round settlement amounts.

The header is:

```text
recordType,escrowId,title,status,token,client,freelancer,label,payee,amount,note,total,toFreelancer,toClient,held,reconciled,difference
```

Each `line` row contains one payout ledger entry, including its note. A final
`totals` row contains the ledger sum in `amount`, all four statement totals,
and the reconciliation result. Identity columns repeat on every row so an
export remains attributable when rows are imported separately. Reconciliation
columns on individual ledger rows are blank; read them from the footer.

## JSON

`statementToJson(statement, generatedAt = new Date())` returns formatted JSON
with a fixed key order. Supply a `Date` to reproduce the exact output in tests.
The document includes the statement identity and dates, dispute data, all ledger
lines, totals, `inProgress`, `reconciliation` and the ISO `generatedAt` timestamp.
Missing optional values are `null`. Unknown input fields are not exported.

## Reconciliation and failures

`reconcile(statement)` returns `{ ok, difference }`, with:

```text
difference = ledgerSum(statement) - statement.totals.total
ok = difference === 0
```

The check includes the existing **Unfunded remainder** ledger entry. In the
existing model, `totals.held` includes both funds still held and the unfunded
budget; exports preserve this meaning. `Resolved` settlement keeps the existing
floor rounding and returns the remaining dust to the client. `Cancelled`
statements keep already-paid milestones and refund only the held funds.

Any finite, nonzero difference fails, including small fractional differences.
Non-finite amounts or arithmetic overflow fail with `difference: null`, rather
than serializing a misleading successful result. JSON represents non-finite
amounts as `null`; the existing CSV formatter renders them as empty cells. The
failed reconciliation result remains in both exports.

A mismatch shows an on-page warning instructing the user to check the ledger.
Downloads remain available so the discrepancy can be investigated. This compares
the read statement internally; it does not independently verify balances against
Soroban or establish that an inconsistent API record is trustworthy. A browser
download failure shows a retryable message without exposing exception details.

Before: a statement could only be printed and displayed the nominal budget even
when ledger data disagreed. After: it provides machine-readable exports and an
explicit warning, for example:

```text
Download CSV   Download JSON
This statement does not reconcile to the escrow budget.
Ledger minus budget: -100 USDC.
Check the ledger before relying on this statement; exports include this warning result.
```

For a cancelled escrow with a budget of 1000 and only 400 funded, the exported
ledger contains `Refund to client = 400` and `Unfunded remainder = 600`.
The footer reports `total = 1000`, `toFreelancer = 0`, `toClient = 400`,
`held = 600`, `reconciled = true` and `difference = 0`.

## Verification

```sh
npx vitest run statementExport statement StatementDownloads
npm run lint
npm test
npm run build
```

Fixtures cover resolved, cancelled, underfunded and zero-budget statements;
mismatches, malformed arithmetic, CSV injection/escaping, stable JSON order,
download contents/filenames, accessible controls and print hiding. No production
credentials or funded transactions are needed.
