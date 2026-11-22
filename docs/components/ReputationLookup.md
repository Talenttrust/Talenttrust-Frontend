# ReputationLookup & StarRating

Components powering freelancer reputation search (`/reputation`) and post-completion rating on the escrow dashboard.

## File Locations

- Reputation lookup page widget: `src/components/ReputationLookup.tsx`
- Star rating radiogroup: `src/components/reputation/StarRating.tsx`
- On-chain reputation reader: `src/lib/stellar/reputation.ts`
- Tests: `src/components/ReputationLookup.test.tsx`, `src/components/reputation/StarRating.test.tsx`

## `ReputationLookup` (`src/components/ReputationLookup.tsx`)

`ReputationLookup` accepts no props. It reads an optional `?address=` query parameter via `useSearchParams()`, validates the Stellar Ed25519 public key using `StrKey.isValidEd25519PublicKey`, and queries both:

1. **On-chain reputation** (`readOnChainReputation` from `src/lib/stellar/reputation.ts`)
2. **TalentTrust REST API** (`GET /api/v1/reputation/:address`)

If both sources resolve with differing values, a notice banner explains that the on-chain Soroban contract state is authoritative while the demo API is an in-memory mirror. Each panel includes an independent retry button (`Retry on-chain` / `Retry API`).

## `StarRating` (`src/components/reputation/StarRating.tsx`)

Accessible 1–5 star rating `role="radiogroup"` rendered on completed escrows before a rating is issued.

### Props (`StarRatingProps`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `onSubmit` | `(rating: number) => void` | Yes | — | Called with the selected rating (`1`–`5`) when **Submit rating** is clicked |
| `disabled` | `boolean` | No | `false` | Disables star selection and submission |
| `error` | `string \| null` | No | `null` | Inline `role="alert"` error message |
