import { truncateAddress } from '../truncateAddress';

describe('truncateAddress', () => {
  it('returns the original value when the string is short enough', () => {
    expect(truncateAddress('GABC12345')).toBe('GABC12345');
    expect(truncateAddress('1234567890')).toBe('1234567890');
  });

  it('properly truncates long addresses', () => {
    expect(truncateAddress('GABC1234DEF5678HIJK9012LMNO3456PQRS7890')).toBe('GABC12...7890');
  });

  it('handles empty or missing values safely', () => {
    expect(truncateAddress('')).toBe('');
  });
});
