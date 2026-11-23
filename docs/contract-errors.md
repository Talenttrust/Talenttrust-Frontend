# Soroban contract errors

`src/lib/stellar/errors.ts` owns the frontend's only error-code table,
`CONTRACT_ERROR_TABLE`. Each numeric code has a contract variant `name` and a
human-readable `message`.

## Source of truth

The numbering comes from the explicit `EscrowError` discriminants in
[`Talenttrust/Talenttrust-Contracts/contracts/escrow/src/lib.rs`](https://github.com/Talenttrust/Talenttrust-Contracts/blob/2c4400bb7f696ec55994f5bfda35673db861128c/contracts/escrow/src/lib.rs),
revision `2c4400bb7f696ec55994f5bfda35673db861128c` (checked 2026-11-22).
That enum defines 50 codes, from `AlreadyInitialized = 1` through
`InvalidSchedule = 50`. In particular, `Unauthorized = 3`,
`InvalidParties = 6`, and `InvalidStatus = 10`; the two previous frontend
tables disagreed about these values.

The contract repository's
[`deployments/testnet.json`](https://github.com/Talenttrust/Talenttrust-Contracts/blob/2c4400bb7f696ec55994f5bfda35673db861128c/deployments/testnet.json)
identifies the same escrow address as the frontend's default `site.contractId`.
This is a source-level ABI reference, not a claim that the deployed WASM was
independently verified. When updating the contract ABI, check the enum again
and update the pinned revision, table, and regression tests together. Never
renumber errors based on UI order or infer meanings from old frontend tables.

## Consumers and compatibility

- `CONTRACT_ERRORS` derives the legacy code-to-name lookup and is re-exported
  from `escrow.ts` for existing imports.
- `ESCROW_ERROR_CODES` and `escrowErrorMessage(code)` derive from the same table.
- `parseContractError` converts Soroban diagnostics, legacy variant names,
  wallet rejections, and RPC failures into display text. Contract codes take
  precedence over generic words such as "balance" or "fee" in RPC diagnostics.
  Unknown numeric codes retain their number in `Contract error code N.`.
- Both `simulateSignSubmit` pipelines use this parser, as do escrow reads and
  `OnChainEscrowActions`. Parsing a known message again preserves its text, so
  an escrow balance error cannot become an unrelated XLM fee error in the UI.

Run the regression tests and type check with:

```bash
npx vitest run src/lib/stellar/errors.test.ts src/lib/stellar/__tests__/escrow.test.ts src/lib/stellar/createContract/submit.test.ts src/components/onchain/__tests__/OnChainEscrowActions.test.tsx
npm run lint
```
