/**
 * @fileoverview Targeted unit tests for the formatAmount function covering:
 *   - NGN locale override (forces NGN currency and en-NG locale)
 *   - Compact notation (produces compact strings and respects caller currency)
 *   - Provider-less fallback behavior.
 */
import { renderHook, act } from "@testing-library/react-hooks";
import { usePreferences } from "../preferences"; // Adjust path if needed

/** Helper to call formatAmount via the hook */
function formatAmountHelper(
  amount: number,
  currency: string = "USD",
  options?: { notation?: "compact" },
) {
  const { result } = renderHook(() => usePreferences());
  // @ts-ignore – formatAmount signature varies based on provider context
  return result.current.formatAmount(amount, currency, options);
}

describe("formatAmount – NGN locale override", () => {
  test("forces NGN currency and en-NG locale regardless of caller currency", () => {
    const formatted = formatAmountHelper(12345, "USD"); // caller provides USD but format should be NGN
    // Should contain NGN symbol or code
    expect(formatted).toMatch(/₦|NGN/);
    // Verify locale formatting (comma separator) – simple regex check
    expect(formatted).toMatch(/\d{1,3}(,\d{3})*\.\d{2}/);
  });
});

describe("formatAmount – compact notation", () => {
  test("produces compact strings while keeping original currency", () => {
    const usdCompact = formatAmountHelper(1500000, "USD", { notation: "compact" });
    const ngnCompact = formatAmountHelper(1500000, "NGN", { notation: "compact" });
    // Expect compact representation like 1.5M (or locale‑specific variant)
    expect(usdCompact).toMatch(/1\.5[MK]?/i);
    expect(ngnCompact).toMatch(/1\.5[MK]?/i);
    // Currency symbols should still be present
    expect(usdCompact).toContain("$");
    expect(ngnCompact).toMatch(/₦|NGN/);
  });
});

describe("formatAmount – provider-less fallback", () => {
  test("formats correctly when usePreferences is called outside a provider", () => {
    const { result } = renderHook(() => usePreferences({ skipProvider: true } as any));
    // @ts-ignore – fallback formatAmount signature
    const fallback = result.current.formatAmount(99.99, "USD");
    expect(fallback).toBe("$99.99");
  });
});
