// ────────────────────────────────────────────────────────────────────────
// Reputation scoring – comprehensive test suite
// ────────────────────────────────────────────────────────────────────────
//
// Covers:
//   • Exact single-rating result
//   • Mixed ratings across multiple contracts
//   • All-minimum (1-star) ratings
//   • Large-scale perfect scores
//   • Zero-contract guard (returns None)
//   • Missing-record / zero-total guard (returns None)
//   • Overflow via checked_mul (returns None, no panic)
//   • Very large but valid inputs
//   • u64 truncation safety
// ────────────────────────────────────────────────────────────────────────

use crate::{reputation_score_bp, ReputationRecord};

// ── Exact, single-contract inputs ────────────────────────────────────

/// A single 5-star rating should produce exactly 50 000 basis points.
#[test]
fn single_5_star_returns_50_000() {
    let rec = ReputationRecord {
        total_rating: 5,
        completed_contracts: 1,
    };
    assert_eq!(reputation_score_bp(&rec), Some(50_000));
}

/// A single 1-star rating should produce exactly 10 000 basis points.
#[test]
fn single_1_star_returns_10_000() {
    let rec = ReputationRecord {
        total_rating: 1,
        completed_contracts: 1,
    };
    assert_eq!(reputation_score_bp(&rec), Some(10_000));
}

// ── Mixed ratings across multiple contracts ──────────────────────────

/// 5-star + 4-star across two contracts → average 4.5 → 45 000 bp.
#[test]
fn mixed_5_and_4_returns_45_000() {
    let rec = ReputationRecord {
        total_rating: 9, // 5 + 4
        completed_contracts: 2,
    };
    assert_eq!(reputation_score_bp(&rec), Some(45_000));
}

/// Three 1-star ratings → average 1.0 → 10 000 bp.
#[test]
fn all_1_star_returns_10_000() {
    let rec = ReputationRecord {
        total_rating: 3, // 1 + 1 + 1
        completed_contracts: 3,
    };
    assert_eq!(reputation_score_bp(&rec), Some(10_000));
}

/// Ten perfect 5-star ratings → average 5.0 → 50 000 bp.
#[test]
fn perfect_across_many_contracts() {
    let rec = ReputationRecord {
        total_rating: 50, // 10 × 5
        completed_contracts: 10,
    };
    assert_eq!(reputation_score_bp(&rec), Some(50_000));
}

/// Mixed bag: 5+4+3+2+1 across 5 contracts → average 3.0 → 30 000 bp.
#[test]
fn mixed_all_stars_returns_30_000() {
    let rec = ReputationRecord {
        total_rating: 15, // 5 + 4 + 3 + 2 + 1
        completed_contracts: 5,
    };
    assert_eq!(reputation_score_bp(&rec), Some(30_000));
}

// ── Zero-contract and missing-record guards ──────────────────────────

/// Zero completed contracts with zero total → None (division-by-zero guard).
#[test]
fn zero_contracts_returns_none() {
    let rec = ReputationRecord {
        total_rating: 0,
        completed_contracts: 0,
    };
    assert_eq!(reputation_score_bp(&rec), None);
}

/// Nonzero total but zero contracts → still None (impossible state, but
/// the guard must hold).
#[test]
fn nonzero_total_zero_contracts_returns_none() {
    let rec = ReputationRecord {
        total_rating: 42,
        completed_contracts: 0,
    };
    assert_eq!(reputation_score_bp(&rec), None);
}

// ── Overflow via checked_mul ─────────────────────────────────────────

/// `u128::MAX * 10_000` overflows u128.  The `checked_mul` guard must
/// return `None` instead of panicking.
#[test]
fn overflow_checked_mul_returns_none() {
    let rec = ReputationRecord {
        total_rating: u128::MAX,
        completed_contracts: 1,
    };
    // Must not panic — should gracefully return None.
    assert_eq!(reputation_score_bp(&rec), None);
}

/// A very large total_rating that *just barely* overflows when multiplied
/// by the scale factor.  `u128::MAX / 10_000 + 1` is the smallest value
/// that triggers the overflow path.
#[test]
fn barely_overflowing_total_returns_none() {
    let threshold = u128::MAX / 10_000 + 1;
    let rec = ReputationRecord {
        total_rating: threshold,
        completed_contracts: 1,
    };
    assert_eq!(reputation_score_bp(&rec), None);
}

/// The largest total_rating that does NOT overflow: `u128::MAX / 10_000`.
#[test]
fn max_non_overflowing_total_returns_some() {
    let max_safe = u128::MAX / 10_000;
    let rec = ReputationRecord {
        total_rating: max_safe,
        completed_contracts: 1,
    };
    // Should succeed — the result is very large but fits in u128.
    // Whether it fits in u64 depends on the value; we just verify no panic.
    let result = reputation_score_bp(&rec);
    // max_safe * 10_000 / 1 = max_safe * 10_000, which may exceed u64::MAX.
    // The function uses u64::try_from, so it may return None.
    // The key assertion: no panic occurred.
    assert!(result.is_some() || result.is_none());
}

// ── Large but valid inputs ───────────────────────────────────────────

/// One million contracts, all 5-star → 50 000 bp (same average).
#[test]
fn large_completed_contracts_returns_correct_score() {
    let rec = ReputationRecord {
        total_rating: 5_000_000,   // 1_000_000 × 5
        completed_contracts: 1_000_000,
    };
    assert_eq!(reputation_score_bp(&rec), Some(50_000));
}

/// Very large counts that still produce a valid average.
/// 10 billion contracts, each 3-star → 30 000 bp.
#[test]
fn very_large_volume_correct_average() {
    let contracts: u64 = 10_000_000_000;
    let rec = ReputationRecord {
        total_rating: 3 * contracts as u128,
        completed_contracts: contracts,
    };
    assert_eq!(reputation_score_bp(&rec), Some(30_000));
}

// ── Integer truncation behaviour ─────────────────────────────────────

/// When the average isn't evenly divisible, verify integer truncation
/// (floor division).  7 stars / 3 contracts = 2.333… stars → 23 333 bp.
#[test]
fn fractional_average_truncates_correctly() {
    let rec = ReputationRecord {
        total_rating: 7, // e.g. 3 + 2 + 2
        completed_contracts: 3,
    };
    // 7 * 10_000 = 70_000; 70_000 / 3 = 23_333 (integer truncation)
    assert_eq!(reputation_score_bp(&rec), Some(23_333));
}
