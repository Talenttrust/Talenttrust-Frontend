# Escrow Reputation Scoring — Basis Point Scale

## Overview

TalentTrust's escrow contract scores freelancer reputation using
**basis points (bp)** — a fixed-point integer scale that avoids
floating-point arithmetic on-chain.

| Metric | Value |
|--------|-------|
| Scale factor | **10 000 bp per star** |
| Minimum (1 ★) | 10 000 bp |
| Maximum (5 ★) | 50 000 bp |
| Precision | Integer (floor division) |

---

## Formula

```text
reputation_bp = (total_rating × 10 000) / completed_contracts
```

Where:

- **`total_rating`** — cumulative sum of raw 1–5 star ratings.
- **`completed_contracts`** — number of contracts rated.
- **`10 000`** — the `SCALE_FACTOR` constant.

---

## Converting Basis Points Back to a Decimal Star Rating

To display a human-readable star rating in the front-end:

```text
stars = basis_points / 10 000.0
```

### Worked Examples

| Scenario | total_rating | contracts | bp result | ÷ 10 000 | Stars |
|----------|-------------|-----------|-----------|----------|-------|
| Single 5 ★ | 5 | 1 | 50 000 | 5.0 | ★★★★★ |
| 5 ★ + 4 ★ | 9 | 2 | 45 000 | 4.5 | ★★★★½ |
| All 3 ★ | 15 | 5 | 30 000 | 3.0 | ★★★ |
| All 1 ★ | 3 | 3 | 10 000 | 1.0 | ★ |
| Mixed (3+2+2) | 7 | 3 | 23 333 | 2.3333 | ★★⅓ |

### TypeScript / Front-end Example

```typescript
/**
 * Convert a basis-point reputation score (0 – 50 000) to a 1.0 – 5.0
 * decimal star rating suitable for UI display.
 */
function bpToStars(basisPoints: number): number {
  return basisPoints / 10_000;
}

// Example usage:
const bp = 45_000;          // from the contract
const stars = bpToStars(bp); // → 4.5
console.log(`Rating: ${stars} ★`);
```

### Rust Example

```rust
let bp: u64 = 45_000;
let stars: f64 = bp as f64 / 10_000.0;
println!("Rating: {stars:.1} ★");  // → "Rating: 4.5 ★"
```

---

## Security Guarantees

### Division by Zero

The `reputation_score_bp` function returns `None` when
`completed_contracts == 0`. Division is never reached — the guard
clause exits early.

```rust
if record.completed_contracts == 0 {
    return None;  // ← exits before any division
}
```

### Arithmetic Overflow

`total_rating * SCALE_FACTOR` uses `checked_mul`, which returns `None`
on overflow instead of panicking or wrapping:

```rust
let scaled = record.total_rating.checked_mul(SCALE_FACTOR)?;
```

Both `u128::MAX` and values just above `u128::MAX / 10_000` are tested
to confirm graceful `None` returns with no panic.

---

## File Reference

| File | Purpose |
|------|---------|
| `contracts/escrow/src/lib.rs` | `ReputationRecord` struct, `SCALE_FACTOR`, `reputation_score_bp()` |
| `contracts/escrow/src/test/reputation.rs` | 15 tests: exact, mixed, zero, overflow, truncation |
| `docs/escrow/reputation_scoring.md` | This file — scaling guide |
