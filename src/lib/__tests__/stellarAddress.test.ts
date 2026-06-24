import { isValidStellarAddress, normalizeStellarAddress } from '../stellarAddress';

describe('stellarAddress helpers', () => {
  it('accepts well-formed Stellar public keys', () => {
    const validAddress = `G${'A'.repeat(55)}`;

    expect(isValidStellarAddress(validAddress)).toBe(true);
    expect(isValidStellarAddress(validAddress.toLowerCase())).toBe(true);
    expect(normalizeStellarAddress(validAddress.toLowerCase())).toBe(validAddress.toUpperCase());
  });

  it('rejects wrong prefixes, bad lengths, and invalid characters', () => {
    expect(isValidStellarAddress('')).toBe(false);
    expect(isValidStellarAddress('ABC1234567890')).toBe(false);
    expect(isValidStellarAddress(`G${'A'.repeat(54)}`)).toBe(false);
    expect(isValidStellarAddress(`G${'A'.repeat(55)}!`)).toBe(false);
    expect(isValidStellarAddress(`G${'A'.repeat(55)}O`)).toBe(false);
  });

  it('normalizes whitespace and case without throwing for invalid input', () => {
    expect(normalizeStellarAddress(`  g${'a'.repeat(55)}  `)).toBe(`G${'A'.repeat(55)}`);
    expect(normalizeStellarAddress('')).toBe('');
    expect(normalizeStellarAddress(undefined as unknown as string)).toBe('');
    expect(isValidStellarAddress('   ')).toBe(false);
  });

  it('keeps the exact 56-character boundary behavior explicit', () => {
    const exactLength = 'G'.padEnd(56, 'A');
    const tooLong = `${exactLength}B`;

    expect(exactLength).toHaveLength(56);
    expect(isValidStellarAddress(exactLength)).toBe(true);
    expect(isValidStellarAddress(tooLong)).toBe(false);
  });
});
