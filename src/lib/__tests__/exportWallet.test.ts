import {
  csvEscape,
  walletItemsToCsv,
  walletItemsToJson,
  triggerDownload,
  downloadWalletCsv,
  downloadWalletJson,
} from '../exportWallet';

import type { WalletItem } from '@/types/domain';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseItem: WalletItem = {
  id: 'w-1',
  name: 'Stellar Lumens (XLM)',
  type: 'Native Asset',
  balance: 12500,
  currency: 'XLM',
  address: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
  status: 'Active',
  createdAt: '2026-01-15',
};

const itemNoAddress: WalletItem = {
  id: 'w-3',
  name: 'Escrow Lock Key #402',
  type: 'Security Credential',
  balance: 1,
  currency: 'KEY',
  status: 'Pending',
  createdAt: '2026-03-10',
};

// ---------------------------------------------------------------------------
// csvEscape
// ---------------------------------------------------------------------------

describe('csvEscape', () => {
  it('returns empty string for null', () => {
    expect(csvEscape(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(csvEscape(undefined)).toBe('');
  });

  it('converts numbers to string', () => {
    expect(csvEscape(12500)).toBe('12500');
  });

  it('passes through a plain string unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('wraps and doubles embedded double-quotes', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps fields containing commas', () => {
    expect(csvEscape('one, two')).toBe('"one, two"');
  });

  it('wraps fields containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps fields containing carriage returns', () => {
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"');
  });

  it('prefixes leading = with tab to prevent formula injection', () => {
    expect(csvEscape('=SUM(A1:A10)')).toBe('\t=SUM(A1:A10)');
  });

  it('prefixes leading + with tab', () => {
    expect(csvEscape('+cmd|exec')).toBe('\t+cmd|exec');
  });

  it('prefixes leading - with tab', () => {
    expect(csvEscape('-100')).toBe('\t-100');
  });

  it('prefixes leading @ with tab', () => {
    expect(csvEscape('@import')).toBe('\t@import');
  });

  it('handles combined formula injection + special chars (comma)', () => {
    // Leading = gets tab-prefixed, then the comma causes quoting
    const result = csvEscape('=1+1,2');
    expect(result).toBe('"\t=1+1,2"');
  });

  it('handles empty string', () => {
    expect(csvEscape('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// walletItemsToCsv
// ---------------------------------------------------------------------------

describe('walletItemsToCsv', () => {
  it('produces CSV with header row and data rows', () => {
    const csv = walletItemsToCsv([baseItem]);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('id,name,type,balance,currency,address,status,createdAt');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('w-1');
    expect(lines[1]).toContain('Stellar Lumens (XLM)');
    expect(lines[1]).toContain('12500');
    expect(lines[1]).toContain('XLM');
    expect(lines[1]).toContain('Active');
    expect(lines[1]).toContain('2026-01-15');
  });

  it('returns headers only for an empty array', () => {
    const csv = walletItemsToCsv([]);
    expect(csv).toBe('id,name,type,balance,currency,address,status,createdAt');
  });

  it('uses empty string for missing address (optional field)', () => {
    const csv = walletItemsToCsv([itemNoAddress]);
    const lines = csv.split('\n');
    const fields = lines[1].split(',');
    // address is the 6th column (index 5)
    expect(fields[5]).toBe('');
  });

  it('handles multiple items', () => {
    const csv = walletItemsToCsv([baseItem, itemNoAddress]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
    expect(lines[1]).toContain('w-1');
    expect(lines[2]).toContain('w-3');
  });

  it('escapes item names containing commas', () => {
    const item: WalletItem = { ...baseItem, name: 'Token, Special' };
    const csv = walletItemsToCsv([item]);
    expect(csv).toContain('"Token, Special"');
  });

  it('escapes item names containing double quotes', () => {
    const item: WalletItem = { ...baseItem, name: 'Token "Alpha"' };
    const csv = walletItemsToCsv([item]);
    expect(csv).toContain('"Token ""Alpha"""');
  });

  it('neutralises formula injection in item names', () => {
    const item: WalletItem = { ...baseItem, name: '=HYPERLINK("evil")' };
    const csv = walletItemsToCsv([item]);
    // Tab prefix + quote wrapping because of embedded quotes
    expect(csv).toContain('\t=HYPERLINK');
  });

  it('respects the currently-filtered view (only exports provided items)', () => {
    // Simulate a filtered view: only pass the subset that matches the filter
    const filtered = [baseItem]; // out of 4 total items, only 1 matches
    const csv = walletItemsToCsv(filtered);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2); // header + 1
    expect(csv).not.toContain('w-3');
  });
});

// ---------------------------------------------------------------------------
// walletItemsToJson
// ---------------------------------------------------------------------------

describe('walletItemsToJson', () => {
  it('produces a valid JSON array', () => {
    const json = walletItemsToJson([baseItem]);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('w-1');
  });

  it('produces pretty-printed JSON with indentation', () => {
    const json = walletItemsToJson([baseItem]);
    expect(json).toContain('\n  ');
  });

  it('returns empty array JSON for empty input', () => {
    const json = walletItemsToJson([]);
    expect(json).toBe('[]');
  });

  it('preserves all WalletItem fields', () => {
    const json = walletItemsToJson([baseItem]);
    const parsed = JSON.parse(json);
    expect(parsed[0]).toEqual(baseItem);
  });

  it('preserves items without optional address', () => {
    const json = walletItemsToJson([itemNoAddress]);
    const parsed = JSON.parse(json);
    expect(parsed[0]).toEqual(itemNoAddress);
    expect(parsed[0].address).toBeUndefined();
  });

  it('respects the currently-filtered view', () => {
    const filtered = [baseItem];
    const json = walletItemsToJson(filtered);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('w-1');
  });
});

// ---------------------------------------------------------------------------
// triggerDownload
// ---------------------------------------------------------------------------

describe('triggerDownload', () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();
    jest.spyOn(document.body, 'appendChild').mockImplementation((el: Node) => el);
    jest.spyOn(document.body, 'removeChild').mockImplementation((el: Node) => el);
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a Blob, triggers a click, and revokes the URL', () => {
    triggerDownload('content', 'file.csv', 'text/csv');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('sets the download attribute on the anchor', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    (document.body.appendChild as jest.Mock).mockImplementation((el: Node) => {
      if (el instanceof HTMLAnchorElement) capturedAnchor = el;
      return el;
    });

    triggerDownload('data', 'wallet.csv', 'text/csv');
    expect(capturedAnchor).not.toBeNull();
    expect(capturedAnchor!.download).toBe('wallet.csv');
    expect(capturedAnchor!.href).toBe('blob:mock');
  });
});

// ---------------------------------------------------------------------------
// downloadWalletCsv & downloadWalletJson (public API)
// ---------------------------------------------------------------------------

describe('downloadWalletCsv and downloadWalletJson', () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();
    jest.spyOn(document.body, 'appendChild').mockImplementation((el: Node) => el);
    jest.spyOn(document.body, 'removeChild').mockImplementation((el: Node) => el);
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('downloadWalletCsv does not throw with wallet items', () => {
    expect(() => downloadWalletCsv([baseItem])).not.toThrow();
  });

  it('downloadWalletJson does not throw with wallet items', () => {
    expect(() => downloadWalletJson([baseItem])).not.toThrow();
  });

  it('downloadWalletCsv handles empty array', () => {
    expect(() => downloadWalletCsv([])).not.toThrow();
  });

  it('downloadWalletJson handles empty array', () => {
    expect(() => downloadWalletJson([])).not.toThrow();
  });

  it('downloadWalletCsv triggers download once', () => {
    downloadWalletCsv([baseItem]);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it('downloadWalletJson triggers download once', () => {
    downloadWalletJson([baseItem]);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it('downloadWalletCsv uses default filename', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    (document.body.appendChild as jest.Mock).mockImplementation((el: Node) => {
      if (el instanceof HTMLAnchorElement) capturedAnchor = el;
      return el;
    });

    downloadWalletCsv([baseItem]);
    expect(capturedAnchor!.download).toBe('wallet.csv');
  });

  it('downloadWalletJson uses default filename', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    (document.body.appendChild as jest.Mock).mockImplementation((el: Node) => {
      if (el instanceof HTMLAnchorElement) capturedAnchor = el;
      return el;
    });

    downloadWalletJson([baseItem]);
    expect(capturedAnchor!.download).toBe('wallet.json');
  });

  it('downloadWalletCsv accepts a custom filename', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    (document.body.appendChild as jest.Mock).mockImplementation((el: Node) => {
      if (el instanceof HTMLAnchorElement) capturedAnchor = el;
      return el;
    });

    downloadWalletCsv([baseItem], 'custom.csv');
    expect(capturedAnchor!.download).toBe('custom.csv');
  });

  it('downloadWalletJson accepts a custom filename', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    (document.body.appendChild as jest.Mock).mockImplementation((el: Node) => {
      if (el instanceof HTMLAnchorElement) capturedAnchor = el;
      return el;
    });

    downloadWalletJson([baseItem], 'custom.json');
    expect(capturedAnchor!.download).toBe('custom.json');
  });
});
