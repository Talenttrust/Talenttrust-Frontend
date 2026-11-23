import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  reportError,
  setErrorReporter,
  normalizeError,
  scrubText,
  __resetDedupeForTests,
  type ErrorReporter,
} from "../errorReporter";

const SECRET_SEED = "S" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);

describe("normalizeError", () => {
  it("maps null and undefined to Error('Unknown error')", () => {
    const a = normalizeError(null);
    const b = normalizeError(undefined);
    expect(a).toBeInstanceOf(Error);
    expect(a.message).toBe("Unknown error");
    expect(b.message).toBe("Unknown error");
  });

  it("passes Error instances through unchanged", () => {
    const err = new Error("boom");
    expect(normalizeError(err)).toBe(err);
  });

  it("wraps non-Error values with cause", () => {
    const out = normalizeError("string failure");
    expect(out).toBeInstanceOf(Error);
    expect(out.message).toBe("string failure");
    expect((out as Error & { cause?: unknown }).cause).toBe("string failure");
  });
});

describe("scrubText", () => {
  it("redacts Stellar secret seeds", () => {
    const out = scrubText(`seed is ${SECRET_SEED} ok`);
    expect(out).not.toContain(SECRET_SEED);
    expect(out).toContain("[REDACTED]");
  });

  it("redacts long base64 XDR blobs", () => {
    const blob = "AAAAAgAAAAB".repeat(20);
    const out = scrubText(`tx ${blob} end`);
    expect(out).not.toContain(blob);
  });

  it("redacts Authorization header values", () => {
    const out = scrubText("Authorization: Bearer abc.def.ghi");
    expect(out).not.toContain("abc.def.ghi");
  });
});

describe("reportError", () => {
  let reporter: ErrorReporter;

  beforeEach(() => {
    __resetDedupeForTests();
    reporter = vi.fn();
    setErrorReporter(reporter);
  });

  afterEach(() => {
    setErrorReporter(null);
    vi.useRealTimers();
  });

  it("forwards scrubbed errors and context to the injected reporter", () => {
    const err = new Error(`leak ${SECRET_SEED}`);
    reportError(err, { source: "test" });
    expect(reporter).toHaveBeenCalledTimes(1);
    const [forwarded, ctx] = (reporter as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(forwarded.message).not.toContain(SECRET_SEED);
    expect(ctx).toEqual({ source: "test" });
  });

  it("deduplicates identical errors within 5 seconds", () => {
    vi.useFakeTimers();
    const err = new Error("same");
    reportError(err, { source: "a" });
    reportError(err, { source: "a" });
    expect(reporter).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5001);
    reportError(err, { source: "a" });
    expect(reporter).toHaveBeenCalledTimes(2);
  });
});
