// ────────────────────────────────────────────────────────────────────────
// TalentTrust Escrow – Reputation Scoring Module
// ────────────────────────────────────────────────────────────────────────
//
// Scores are expressed in **basis points** (bp) on a 0 – 50 000 scale.
//
//   1 star  = 10 000 bp
//   5 stars = 50 000 bp
//
// The constant `SCALE_FACTOR` (10 000) converts a raw star average into
// basis-point precision without floating-point arithmetic.
// ────────────────────────────────────────────────────────────────────────

/// Scale factor that maps each integer star (1–5) to basis points.
///
/// Multiplying a raw star rating by this factor yields a value in basis
/// points:
///
/// | Stars | × 10 000 | Basis Points |
/// |-------|----------|--------------|
/// | 1     | × 10 000 | 10 000       |
/// | 3     | × 10 000 | 30 000       |
/// | 5     | × 10 000 | 50 000       |
///
/// To convert back to a decimal star rating:
///
/// ```text
/// stars = basis_points as f64 / 10_000.0
/// ```
const SCALE_FACTOR: u128 = 10_000;

/// On-chain reputation record for a single participant.
///
/// # Fields
///
/// * `total_rating`        – Cumulative sum of raw star ratings (each 1–5)
///                           received across all completed contracts.
/// * `completed_contracts` – Number of contracts that contributed a rating.
///
/// # Invariant
///
/// `total_rating <= completed_contracts * 5` must hold when ratings are
/// constrained to the 1–5 range, but the scoring function tolerates any
/// `u128` value and relies on `checked_mul` for overflow safety.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReputationRecord {
    /// Sum of all raw star ratings received (each in the 1–5 range).
    pub total_rating: u128,
    /// Number of contracts that contributed a rating.
    pub completed_contracts: u64,
}

/// Computes the average reputation score in **basis points**.
///
/// # Returns
///
/// * `Some(score)` — the average rating scaled to basis points (0 – 50 000
///   for valid 1–5 star inputs).
/// * `None` in two cases:
///   1. `completed_contracts == 0` — avoids division by zero.
///   2. `total_rating * SCALE_FACTOR` overflows `u128` — the `checked_mul`
///      guard returns `None` instead of panicking.
///
/// # Security
///
/// Division by zero is **impossible** because the function returns `None`
/// before reaching the division when `completed_contracts == 0`.
///
/// Overflow is **impossible** to trigger silently because `checked_mul`
/// converts the overflow into a `None` return value, preventing any
/// wrapping or panic.
///
/// # Examples
///
/// ```
/// use talenttrust_escrow::{ReputationRecord, reputation_score_bp};
///
/// // Single 5-star rating → 50 000 bp
/// let rec = ReputationRecord { total_rating: 5, completed_contracts: 1 };
/// assert_eq!(reputation_score_bp(&rec), Some(50_000));
///
/// // Mixed 5-star + 4-star across 2 contracts → 45 000 bp
/// let rec = ReputationRecord { total_rating: 9, completed_contracts: 2 };
/// assert_eq!(reputation_score_bp(&rec), Some(45_000));
///
/// // No contracts → None (division-by-zero guard)
/// let rec = ReputationRecord { total_rating: 0, completed_contracts: 0 };
/// assert_eq!(reputation_score_bp(&rec), None);
/// ```
pub fn reputation_score_bp(record: &ReputationRecord) -> Option<u64> {
    // Guard: division by zero is impossible — we return early.
    if record.completed_contracts == 0 {
        return None;
    }

    // Guard: checked_mul returns None on overflow instead of panicking.
    let scaled = record.total_rating.checked_mul(SCALE_FACTOR)?;

    // Safe: completed_contracts > 0 is guaranteed by the guard above.
    let average = scaled / (record.completed_contracts as u128);

    // Truncate to u64. In normal usage (1–5 stars) the result fits
    // comfortably, but we use try_into for defence-in-depth.
    u64::try_from(average).ok()
}

#[cfg(test)]
mod test;
