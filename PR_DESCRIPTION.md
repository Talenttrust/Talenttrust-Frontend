# PR Description: Add StrKey Checksum Validation to `isValidStellarAddress`

## Overview
This PR tightens the existing `isValidStellarAddress` validator by adding a StrKey-style CRC16-XModem checksum check behind the current fast structural pre-filter. The validator previously accepted any 56-character string starting with `G` and using only the base32 alphabet (`A-Z2-7`), which is intentionally conservative but still allows many invalid keys to pass. With this change, only keys that decode correctly, carry the expected ed25519 public-key version byte (`0x30`), and contain a valid checksum are accepted.

## Problem Statement
**Issue:** #227 — `isValidStellarAddress` only checks length, prefix, and base32 alphabet. Its own doc comment notes this is "intentionally conservative" and accepts many strings that aren't real keys.

The function is used for display and form handling (e.g., `truncateAddress`). Accepting malformed addresses can lead to confusing UI states or downstream errors when a user pastes a structurally plausible but semantically invalid key.

## Solution
A two-stage validation approach keeps the cheap regex pre-filter as a fast guard, while deferring the heavier base32 decode and CRC verification to the second stage only when the first stage passes:

1. **Fast structural guard** — unchanged from before:
   - Length must be exactly 56.
   - Must start with `G`.
   - All characters must be in `A-Z2-7`.

2. **StrKey checksum verification** — new:
   - Decode the string with the Stellar base32 alphabet.
   - Verify the decoded payload is exactly 35 bytes (1 version byte + 32-byte payload + 2-byte checksum).
   - Confirm the first byte equals `0x30` (ed25519 public key).
   - Compute a CRC16-XModem checksum over the first 33 bytes and compare it against the stored 2-byte trailer (little-endian).

The implementation is entirely self-contained (no Stellar SDK dependency).

## Files Changed

### `src/lib/stellarAddress.ts`
- Replaced the old "conservative" doc comment with a detailed two-stage description.
- Added constants:
  - `STELLAR_BASE32_ALPHABET`
  - `STELLAR_PUBLIC_KEY_VERSION_BYTE = 0x30`
  - `CRC16_XMODEM_TABLE` (lookup table for speed)
- Added helper functions:
  - `computeCRC16XModem(payload: Uint8Array): number`
  - `decodeStellarBase32(encoded: string): Uint8Array | null`
  - `isValidStellarChecksum(address: string): boolean`
- Updated `isValidStellarAddress` to branch into the checksum step only after the fast guard passes.

### `src/lib/__tests__/stellarAddress.test.ts`
- Replaced synthetic test inputs (e.g., `G` + 55 `A`s) with a known-valid real key.
- Added new test suites:
  - **Valid StrKey checksum:** asserts that a real key and its lowercase variant both pass.
  - **Invalid checksum:** asserts that single-character tampering (different char at position 4 and last char) fails.
  - **Malformed keys:** truncated and extended inputs are rejected.
  - **Nullish / empty input:** `null`, `undefined`, and `''` all return `false` without throwing.
  - **Decode-error resilience:** non-base32 characters and short strings never throw.

### `src/lib/__tests__/truncateAddress.test.ts`
- Updated the "valid Stellar address" fixture to use a real lowercase key so that `truncateAddress` still receives a key that passes the new checksum validation and gets normalized correctly.

## Test Coverage
| Suite | Tests | Status |
|-------|-------|--------|
| `stellarAddress.test.ts` | 8 | All pass |
| `truncateAddress.test.ts` | 4 | All pass |
| Other suites (regression) | — | No changes to behavior |

Target: ≥ 95 % coverage for the impacted module. The new logic is fully exercised through positive, negative, and edge-case paths.

## Security Notes
- All decode failures return `false`; no exceptions are thrown from `isValidStellarAddress` regardless of input.
- The fast pre-filter prevents unnecessary base32 decoding on obviously malformed inputs.
- The checksum algorithm mirrors the official Stellar `strkey` implementation (CRC16-XModem with little-endian storage), ensuring interoperability with real Stellar addresses.
- The version-byte check (`0x30`) prevents keys from other StrKey families (e.g., seeds, hashes, contracts) from being accepted as public keys.

## Checklist
- [x] Implementation in `src/lib/stellarAddress.ts`
- [x] Comprehensive tests in `src/lib/__tests__/stellarAddress.test.ts`
- [x] Updated dependent test fixture in `src/lib/__tests__/truncateAddress.test.ts`
- [x] `npm run lint` passes on changed files
- [x] `npm test` passes for impacted suites
- [x] `npm run build` succeeds
- [x] Updated module doc comment with new behavior description

closes #227
