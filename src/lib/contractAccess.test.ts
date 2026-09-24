import {
  accessRecoveryLinks,
  canMutate,
  decideContractAccess,
  describeAccess,
  isPublicResource,
  normaliseAddress,
} from './contractAccess';

const WALLET = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';
const OTHER_WALLET = 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210';

describe('normaliseAddress', () => {
  it('trims and lower-cases an address', () => {
    expect(normaliseAddress('  GaBc  ')).toBe('gabc');
  });

  it('returns an empty string for null, undefined and blank input', () => {
    expect(normaliseAddress(null)).toBe('');
    expect(normaliseAddress(undefined)).toBe('');
    expect(normaliseAddress('   ')).toBe('');
  });
});

describe('isPublicResource', () => {
  it('treats an absent list as public', () => {
    expect(isPublicResource(undefined)).toBe(true);
    expect(isPublicResource(null)).toBe(true);
  });

  it('treats an empty list as public', () => {
    expect(isPublicResource([])).toBe(true);
  });

  it('treats a list of blank entries as public', () => {
    expect(isPublicResource(['', '   '])).toBe(true);
  });

  it('treats a list with a real address as restricted', () => {
    expect(isPublicResource([WALLET])).toBe(false);
  });
});

describe('decideContractAccess — wallet loading', () => {
  it('returns loading while the wallet session is unresolved', () => {
    expect(
      decideContractAccess({
        walletAddress: null,
        walletResolved: false,
        resourceExists: true,
      }),
    ).toBe('loading');
  });

  it('does not report not-found while the wallet is still resolving', () => {
    // The whole point of the ordering: a slow wallet must never turn into a
    // "this contract does not exist" verdict.
    expect(
      decideContractAccess({
        walletAddress: null,
        walletResolved: false,
        resourceExists: false,
      }),
    ).toBe('loading');
  });

  it('does not report unauthorized while the wallet is still resolving', () => {
    expect(
      decideContractAccess({
        walletAddress: null,
        walletResolved: false,
        resourceExists: true,
        permittedAddresses: [WALLET],
      }),
    ).toBe('loading');
  });
});

describe('decideContractAccess — unknown id', () => {
  it('returns not-found when the resource does not exist', () => {
    expect(
      decideContractAccess({
        walletAddress: WALLET,
        walletResolved: true,
        resourceExists: false,
      }),
    ).toBe('not-found');
  });

  it('returns not-found even for a restricted resource with no wallet', () => {
    // Existence is a property of the resource, not of the caller: if the
    // resource is genuinely absent, absence is the honest answer.
    expect(
      decideContractAccess({
        walletAddress: null,
        walletResolved: true,
        resourceExists: false,
        permittedAddresses: [WALLET],
      }),
    ).toBe('not-found');
  });
});

describe('decideContractAccess — unauthorized id', () => {
  it('returns unauthorized when a restricted resource has no connected wallet', () => {
    expect(
      decideContractAccess({
        walletAddress: null,
        walletResolved: true,
        resourceExists: true,
        permittedAddresses: [WALLET],
      }),
    ).toBe('unauthorized');
  });

  it('returns unauthorized when the connected wallet is not permitted', () => {
    expect(
      decideContractAccess({
        walletAddress: OTHER_WALLET,
        walletResolved: true,
        resourceExists: true,
        permittedAddresses: [WALLET],
      }),
    ).toBe('unauthorized');
  });

  it('distinguishes unauthorized from not-found for the same id', () => {
    const base = {
      walletAddress: 'someone-else',
      walletResolved: true,
      resourceExists: true,
      permittedAddresses: [WALLET],
    };

    // Same identity, same id shape — only existence differs, and the two
    // answers must differ, otherwise the route leaks existence.
    expect(decideContractAccess(base)).toBe('unauthorized');
    expect(decideContractAccess({ ...base, resourceExists: false })).toBe(
      'not-found',
    );
  });
});

describe('decideContractAccess — granted', () => {
  it('grants a public resource with no wallet connected', () => {
    expect(
      decideContractAccess({
        walletAddress: null,
        walletResolved: true,
        resourceExists: true,
      }),
    ).toBe('granted');
  });

  it('grants a public resource with an empty permitted list', () => {
    expect(
      decideContractAccess({
        walletAddress: null,
        walletResolved: true,
        resourceExists: true,
        permittedAddresses: [],
      }),
    ).toBe('granted');
  });

  it('grants a permitted wallet', () => {
    expect(
      decideContractAccess({
        walletAddress: WALLET,
        walletResolved: true,
        resourceExists: true,
        permittedAddresses: [WALLET],
      }),
    ).toBe('granted');
  });

  it('matches permitted addresses case-insensitively and ignoring whitespace', () => {
    expect(
      decideContractAccess({
        walletAddress: `  ${WALLET.toLowerCase()}  `,
        walletResolved: true,
        resourceExists: true,
        permittedAddresses: [WALLET],
      }),
    ).toBe('granted');
  });

  it('grants when the wallet is one of several permitted addresses', () => {
    expect(
      decideContractAccess({
        walletAddress: OTHER_WALLET,
        walletResolved: true,
        resourceExists: true,
        permittedAddresses: [WALLET, OTHER_WALLET],
      }),
    ).toBe('granted');
  });
});

describe('describeAccess', () => {
  it('never claims a resource is missing for the unauthorized state', () => {
    const copy = describeAccess('unauthorized');
    expect(copy.title.toLowerCase()).not.toContain('not found');
    expect(copy.message.toLowerCase()).not.toContain('does not exist');
  });

  it('says plainly when a resource is missing', () => {
    expect(describeAccess('not-found').title).toMatch(/not found/i);
  });

  it('returns copy for every state', () => {
    const kinds = ['loading', 'not-found', 'unauthorized', 'granted'] as const;
    for (const kind of kinds) {
      const copy = describeAccess(kind);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
    }
  });
});

describe('accessRecoveryLinks', () => {
  it('offers a way forward for the unauthorized state', () => {
    const links = accessRecoveryLinks('unauthorized');
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((link) => link.href === '/contracts')).toBe(true);
    expect(links.some((link) => link.href === '/wallet')).toBe(true);
  });

  it('offers recovery links for the not-found state', () => {
    const links = accessRecoveryLinks('not-found');
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((link) => link.href === '/contracts')).toBe(true);
  });

  it('offers no recovery links once access is granted', () => {
    expect(accessRecoveryLinks('granted')).toEqual([]);
  });

  it('offers no recovery links while still loading', () => {
    expect(accessRecoveryLinks('loading')).toEqual([]);
  });

  it('gives every recovery link a label and a description', () => {
    const kinds = ['not-found', 'unauthorized'] as const;
    for (const kind of kinds) {
      for (const link of accessRecoveryLinks(kind)) {
        expect(link.label.length).toBeGreaterThan(0);
        expect(link.description.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('canMutate', () => {
  it('allows mutation when granted with a connected wallet', () => {
    expect(canMutate('granted', WALLET)).toBe(true);
  });

  it('disallows mutation when granted but no wallet is connected', () => {
    expect(canMutate('granted', null)).toBe(false);
  });

  it('disallows mutation for loading, not-found and unauthorized', () => {
    expect(canMutate('loading', WALLET)).toBe(false);
    expect(canMutate('not-found', WALLET)).toBe(false);
    expect(canMutate('unauthorized', WALLET)).toBe(false);
  });
});
