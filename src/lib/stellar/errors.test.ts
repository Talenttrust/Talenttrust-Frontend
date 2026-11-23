import { describe, it, expect } from 'vitest';
import {
  parseContractError,
  escrowErrorMessage,
  ESCROW_ERROR_CODES,
  CONTRACT_ERROR_TABLE,
  CONTRACT_ERRORS,
} from './errors';

describe('ESCROW_ERROR_CODES', () => {
  it('covers all 50 variants in the pinned contract enum', () => {
    expect(ESCROW_ERROR_CODES).toHaveLength(50);
    for (let code = 1; code <= 50; code++) {
      expect(ESCROW_ERROR_CODES).toContain(code);
    }
  });

  it('has unique, non-empty names and messages and derives every lookup', () => {
    const entries = Object.values(CONTRACT_ERROR_TABLE);
    expect(new Set(entries.map((entry) => entry.name)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.message)).size).toBe(entries.length);
    for (const code of ESCROW_ERROR_CODES) {
      const entry = CONTRACT_ERROR_TABLE[code];
      expect(entry.name.trim()).not.toBe('');
      expect(entry.message.trim()).not.toBe('');
      expect(CONTRACT_ERRORS[code]).toBe(entry.name);
      expect(escrowErrorMessage(code)).toBe(entry.message);
    }
  });

  it('uses the contract discriminants rather than either old table', () => {
    expect(CONTRACT_ERRORS[3]).toBe('Unauthorized');
    expect(CONTRACT_ERRORS[4]).toBe('Paused');
    expect(CONTRACT_ERRORS[6]).toBe('InvalidParties');
    expect(CONTRACT_ERRORS[7]).toBe('InvalidMilestones');
    expect(CONTRACT_ERRORS[10]).toBe('InvalidStatus');
    expect(CONTRACT_ERRORS[11]).toBe('MilestoneNotFound');
    expect(CONTRACT_ERRORS[14]).toBe('InvalidSplit');
    expect(CONTRACT_ERRORS[50]).toBe('InvalidSchedule');
  });

  it('returns a non-empty string for every code', () => {
    for (const code of ESCROW_ERROR_CODES) {
      const msg = escrowErrorMessage(code);
      expect(typeof msg).toBe('string');
      expect((msg as string).length).toBeGreaterThan(0);
    }
  });
});

describe('parseContractError', () => {
  it.each(ESCROW_ERROR_CODES)('formats code %i consistently and preserves formatted text', (code) => {
    const message = escrowErrorMessage(code);
    expect(parseContractError(new Error(`Error(Contract, #${code})`))).toBe(message);
    expect(parseContractError(`Error(Contract, #${code})`)).toBe(message);
    expect(parseContractError(new Error(CONTRACT_ERRORS[code]))).toBe(message);
    expect(parseContractError(new Error(message))).toBe(message);
  });

  it('prioritizes a contract code over generic fee/balance words', () => {
    expect(parseContractError(new Error('fee balance: Error(Contract, #13)')))
      .toBe(escrowErrorMessage(13));
  });

  it('keeps an unknown code visible instead of guessing a meaning', () => {
    expect(escrowErrorMessage(999)).toBeUndefined();
    expect(parseContractError(new Error('Error(Contract, #999)'))).toBe('Contract error code 999.');
  });

  it('recognizes wallet connection failures', () => {
    expect(parseContractError(new Error('Freighter not connected'))).toMatch(/wallet not connected/i);
  });
  it('maps a contract error code in the error message', () => {
    const err = new Error('Transaction simulation failed: Error(Contract, #7)');
    const msg = parseContractError(err);
    // Code 7 = InvalidMilestones
    expect(msg).toContain('milestone');
  });

  it('detects user rejection', () => {
    const msg = parseContractError(new Error('User rejected the request'));
    expect(msg).toMatch(/cancelled|rejected/i);
  });

  it('detects wrong network', () => {
    const msg = parseContractError(new Error('wrong passphrase'));
    expect(msg).toMatch(/network mismatch|testnet/i);
  });

  it('detects RPC timeout', () => {
    const msg = parseContractError(new Error('Request timed out'));
    expect(msg).toMatch(/timeout/i);
  });

  it('detects insufficient XLM', () => {
    const msg = parseContractError(new Error('insufficient fee balance'));
    expect(msg).toMatch(/xlm|fee|insufficient/i);
  });

  it('falls back to the raw error message for unknown errors', () => {
    const msg = parseContractError(new Error('some totally unknown error xyz'));
    expect(msg).toBe('some totally unknown error xyz');
  });

  it('handles non-Error thrown values', () => {
    const msg = parseContractError('just a string');
    expect(msg).toBe('just a string');
  });
});
