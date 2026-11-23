import { describe, it, expect } from 'vitest';
import { stroopsFromXlm, xlmFromStroops, StroopConversionError } from './stroops';

describe('stroopsFromXlm', () => {
  it('converts whole XLM amounts', () => {
    expect(stroopsFromXlm('1')).toBe(10_000_000n);
    expect(stroopsFromXlm('100')).toBe(1_000_000_000n);
  });

  it('converts decimal amounts', () => {
    expect(stroopsFromXlm('12.5')).toBe(125_000_000n);
    expect(stroopsFromXlm('0.0000001')).toBe(1n);
  });

  it('handles the minimum meaningful amount (1 stroop)', () => {
    expect(stroopsFromXlm('0.0000001')).toBe(1n);
  });

  it('rejects zero', () => {
    expect(() => stroopsFromXlm('0')).toThrow(StroopConversionError);
    expect(() => stroopsFromXlm('0.0000000')).toThrow(StroopConversionError);
  });

  it('rejects negative numbers', () => {
    expect(() => stroopsFromXlm('-1')).toThrow(StroopConversionError);
  });

  it('rejects more than 7 decimal places', () => {
    expect(() => stroopsFromXlm('1.00000001')).toThrow(StroopConversionError);
  });

  it('rejects non-numeric input', () => {
    expect(() => stroopsFromXlm('abc')).toThrow(StroopConversionError);
    expect(() => stroopsFromXlm('')).toThrow(StroopConversionError);
    expect(() => stroopsFromXlm('1e5')).toThrow(StroopConversionError);
    expect(() => stroopsFromXlm('1,000')).toThrow(StroopConversionError);
  });
});

describe('xlmFromStroops', () => {
  it('round-trips back to the original XLM string', () => {
    expect(xlmFromStroops(10_000_000n)).toBe('1.0000000');
    expect(xlmFromStroops(1n)).toBe('0.0000001');
    expect(xlmFromStroops(125_000_000n)).toBe('12.5000000');
  });
});

import { parseTokenAmount, formatTokenAmount } from './stroops';

describe('parseTokenAmount', () => {
  it('works with 0 decimals (whole units only)', () => {
    expect(parseTokenAmount('5', 0)).toBe(5n);
  });

  it('rejects fractional input for 0-decimal token', () => {
    expect(() => parseTokenAmount('1.5', 0)).toThrow(StroopConversionError);
  });

  it('works with 6 decimals (USDC-style)', () => {
    expect(parseTokenAmount('1', 6)).toBe(1_000_000n);
    expect(parseTokenAmount('1.5', 6)).toBe(1_500_000n);
    expect(parseTokenAmount('0.000001', 6)).toBe(1n);
  });

  it('rejects more decimals than the token supports (6-decimal token)', () => {
    expect(() => parseTokenAmount('1.1234567', 6)).toThrow(StroopConversionError);
  });

  it('works with 7 decimals (XLM)', () => {
    expect(parseTokenAmount('1', 7)).toBe(10_000_000n);
  });

  it('works with 18 decimals', () => {
    expect(parseTokenAmount('1', 18)).toBe(10n ** 18n);
    expect(parseTokenAmount('0.000000000000000001', 18)).toBe(1n);
  });

  it('rejects zero', () => {
    expect(() => parseTokenAmount('0', 6)).toThrow(StroopConversionError);
  });

  it('rejects negative', () => {
    expect(() => parseTokenAmount('-1', 6)).toThrow(StroopConversionError);
  });

  it('rejects non-numeric', () => {
    expect(() => parseTokenAmount('abc', 6)).toThrow(StroopConversionError);
  });
});

describe('formatTokenAmount', () => {
  it('formats 0-decimal token', () => {
    expect(formatTokenAmount(5n, 0, 'NFT')).toBe('5 NFT');
  });

  it('formats 6-decimal token', () => {
    expect(formatTokenAmount(1_500_000n, 6, 'USDC')).toBe('1.5 USDC');
  });

  it('formats 7-decimal token (XLM)', () => {
    expect(formatTokenAmount(10_000_000n, 7, 'XLM')).toBe('1 XLM');
  });

  it('formats 18-decimal token', () => {
    expect(formatTokenAmount(10n ** 18n, 18, 'ETH')).toBe('1 ETH');
  });

  it('trims trailing zeros', () => {
    expect(formatTokenAmount(1_500_000n, 7, 'XLM')).toBe('0.15 XLM');
  });
});
