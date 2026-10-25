import { describe, it, expect } from 'vitest';
import {
  parseContractError,
  escrowErrorMessage,
  ESCROW_ERROR_CODES,
} from './errors';

describe('ESCROW_ERROR_CODES', () => {
  it('covers all 16 EscrowError variants', () => {
    expect(ESCROW_ERROR_CODES).toHaveLength(16);
    // Codes must be 1–16 with no gaps
    for (let code = 1; code <= 16; code++) {
      expect(ESCROW_ERROR_CODES).toContain(code);
    }
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
