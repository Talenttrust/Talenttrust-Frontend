import { isValidContractId } from '../validateContractId';

describe('isValidContractId', () => {
  it.each(['123', 'contract_123-ABC', 'abcDEF012', 'a'.repeat(64)])(
    'accepts safe contract id %p',
    (id) => {
      expect(isValidContractId(id)).toBe(true);
    },
  );

  it.each([
    '',
    ' contract-123',
    'contract 123',
    '../contracts',
    'contract/123',
    '<script>',
    'abc.def',
    'a'.repeat(65),
  ])('rejects unsafe contract id %p', (id) => {
    expect(isValidContractId(id)).toBe(false);
  });
});
