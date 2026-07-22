import { isValidContractId } from '../validateContractId';

describe('isValidContractId', () => {
  it.each([
    '123',
    'abc',
    'contract-42',
    'contract_99',
    'ABC-123_xyz',
    'a'.repeat(64),
  ])('returns true for valid id %j', (id) => {
    expect(isValidContractId(id)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['slash path', '../etc/passwd'],
    ['null byte', 'abc\0def'],
    ['special chars', 'id#1'],
    ['angle brackets', '<script>'],
    ['oversized', 'a'.repeat(65)],
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['object', {}],
  ])('returns false for %s', (_label, value) => {
    expect(isValidContractId(value)).toBe(false);
  });
});
