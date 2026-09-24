import {
  resolveContractData,
  contractExists,
  permittedAddressesFor,
} from '@/lib/contractResolver';

describe('resolveContractData', () => {
  /**
   * Covers the happy path for a known contract id and verifies the returned payload
   * includes the contract metadata the detail page expects.
   */
  it('returns the expected contract payload for a known id', async () => {
    const contract = await resolveContractData('123');

    expect(contract).toEqual(
      expect.objectContaining({
        id: '123',
        name: 'Stellar Escrow Implementation',
        status: 'Active',
        totalValue: 7000,
        currency: 'USD',
        milestones: expect.arrayContaining([
          expect.objectContaining({ id: 'ms-1' }),
        ]),
      })
    );
  });

  /**
   * #1136: an unknown id must NOT resolve to invented data. The old behaviour
   * returned a fallback record for any id, which made "does this contract
   * exist?" unanswerable and let any link render a plausible fake. Unknown now
   * throws, and the route renders that as a not-found access state.
   */
  it('throws for a well-formed unknown id instead of inventing data', async () => {
    await expect(resolveContractData('missing-contract')).rejects.toThrow(
      /was not found/i
    );
  });

  /**
   * #1136 edge case: malformed ids never resolve. Route-param validation
   * (isValidContractId) is the first gate; the resolver is the second —
   * defense in depth, because a malformed id cannot name a real contract.
   */
  it('throws for a malformed id', async () => {
    await expect(resolveContractData('<script>bad</script>')).rejects.toThrow(
      /was not found/i
    );
  });
});

describe('contractExists', () => {
  it('answers true for the demo contract', () => {
    expect(contractExists('123')).toBe(true);
  });

  it('answers false for an unknown id', () => {
    expect(contractExists('missing-contract')).toBe(false);
  });

  it('answers true for a restricted contract id', () => {
    expect(contractExists('restricted-demo')).toBe(true);
  });
});

describe('permittedAddressesFor', () => {
  it('returns null for a public contract — no restriction', () => {
    expect(permittedAddressesFor('123')).toBeNull();
  });

  it('returns the permitted wallets for a restricted contract', () => {
    const permitted = permittedAddressesFor('restricted-demo');
    expect(permitted).not.toBeNull();
    expect(permitted).toContain('GADEMOCLIENT0000000000000000000000000000000001');
  });

  it('returns null for an unknown id (existence is decided separately)', () => {
    expect(permittedAddressesFor('missing-contract')).toBeNull();
  });
});
