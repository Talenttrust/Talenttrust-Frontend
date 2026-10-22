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
