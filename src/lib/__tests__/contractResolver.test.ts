import { resolveContractData } from '@/lib/contractResolver';

describe('resolveContractData', () => {
  /**
   * Covers the happy path for a known contract id and verifies the returned payload
   * includes the contract metadata the detail page expects.
   */
  it('returns the expected contract payload for a known id', async () => {
    const contract = await resolveContractData('contract-123');

    expect(contract).toEqual(
      expect.objectContaining({
        id: 'contract-123',
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
   * Documents the current resolver behavior for an unknown id: there is no not-found
   * branch in the implementation, so the function resolves a fallback contract record
   * instead of returning null or undefined.
   */
  it('does not return null for an unknown id and preserves the requested id', async () => {
    const contract = await resolveContractData('missing-contract');

    expect(contract).not.toBeNull();
    expect(contract).toEqual(expect.objectContaining({ id: 'missing-contract' }));
  });

  /**
   * Confirms the resolver does not trim or normalize incoming ids before returning them.
   * This documents the current contract for whitespace-sensitive ids.
   */
  it('does not trim or normalize ids before returning the contract payload', async () => {
    const rawId = '  contract-42  ';
    const contract = await resolveContractData(rawId);

    expect(contract.id).toBe(rawId);
  });

  /**
   * Guards against malformed ids so contract resolution stays safe and does not throw
   * when route params contain unexpected characters.
   */
  it('does not throw for malformed ids', async () => {
    await expect(resolveContractData('<script>bad</script>')).resolves.toEqual(
      expect.objectContaining({ id: '<script>bad</script>' })
    );
  });
});
