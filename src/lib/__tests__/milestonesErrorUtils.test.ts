import {
  ensureValidError,
  getErrorIdentity,
  hasSameErrorIdentity,
} from '@/lib/milestonesErrorUtils';

describe('milestonesErrorUtils', () => {
  describe('ensureValidError', () => {
    it('returns the same Error instance when given a valid Error', () => {
      const error = new Error('test error');
      const result = ensureValidError(error);
      expect(result).toBe(error);
    });

    it('returns a synthetic Error for null input', () => {
      const result = ensureValidError(null);
      expect(result instanceof Error).toBe(true);
      expect(result.message).toBe('Invalid milestone error');
    });

    it('returns a synthetic Error for undefined input', () => {
      const result = ensureValidError(undefined);
      expect(result instanceof Error).toBe(true);
      expect(result.message).toBe('Invalid milestone error');
    });

    it('returns a synthetic Error for a string primitive', () => {
      const result = ensureValidError('some string');
      expect(result instanceof Error).toBe(true);
      expect(result.message).toBe('some string');
    });

    it('returns a synthetic Error for a number primitive', () => {
      const result = ensureValidError(42);
      expect(result instanceof Error).toBe(true);
      expect(result.message).toBe('42');
    });

    it('returns a synthetic Error for a plain object', () => {
      const result = ensureValidError({ foo: 'bar' });
      expect(result instanceof Error).toBe(true);
      expect(result.message).toBe('[object Object]');
    });
  });

  describe('getErrorIdentity', () => {
    it('returns digest-based identity when digest is present', () => {
      const error = new Error('x') as Error & { digest?: string };
      error.digest = 'abc123';
      expect(getErrorIdentity(error)).toBe('digest:abc123');
    });

    it('falls back to object identity when digest is empty', () => {
      const error = new Error('x') as Error & { digest?: string };
      error.digest = '';
      expect(getErrorIdentity(error)).toBe('object:Error:x');
    });

    it('falls back to neutral identity when digest is undefined', () => {
      const error = new Error('x') as Error & { digest?: string };
      expect(getErrorIdentity(error)).toBe('object:Error:x');
    });

    it('handles hostile name getter gracefully', () => {
      class HostileError extends Error {
        get name(): string {
          throw new Error('name getter exploded');
        }
      }
      const error = new HostileError();
      expect(() => getErrorIdentity(error)).not.toThrow();
      expect(getErrorIdentity(error)).toBe('object:Error:');
    });

    it('handles hostile digest getter gracefully', () => {
      const error = new Error('x');
      Object.defineProperty(error, 'digest', {
        get: () => { throw new Error('hostile'); },
        enumerable: true,
        configurable: true,
      });
      expect(() => getErrorIdentity(error)).not.toThrow();
      expect(getErrorIdentity(error)).toBe('object:Error:x');
    });

    it('handles hostile message getter gracefully', () => {
      class HostileMessageError extends Error {
        get message(): string {
          throw new Error('message getter exploded');
        }
      }
      const error = new HostileMessageError();
      expect(() => getErrorIdentity(error)).not.toThrow();
      expect(getErrorIdentity(error)).toBe('object:Error:');
    });

    it('handles hostile name getter gracefully', () => {
      class HostileNameError extends Error {
        get name(): string {
          throw new Error('name getter exploded');
        }
      }
      const error = new HostileNameError();
      expect(() => getErrorIdentity(error)).not.toThrow();
      expect(getErrorIdentity(error)).toBe('object:Error:');
    });
  });

  describe('hasSameErrorIdentity', () => {
    it('returns false for null existing error', () => {
      const incoming = new Error('test');
      expect(hasSameErrorIdentity(null, incoming)).toBe(false);
    });

    it('returns true for same error instance', () => {
      const error = new Error('test');
      expect(hasSameErrorIdentity(error, error)).toBe(true);
    });

    it('returns true for same identity different references', () => {
      const error1 = new Error('test');
      error1.digest = 'same-digest';
      const error2 = new Error('different message');
      error2.digest = 'same-digest';
      expect(hasSameErrorIdentity(error1, error2)).toBe(true);
    });

    it('returns false for different digests', () => {
      const error1 = new Error('test');
      error1.digest = 'digest-a';
      const error2 = new Error('test');
      error2.digest = 'digest-b';
      expect(hasSameErrorIdentity(error1, error2)).toBe(false);
    });

    it('returns false for different names and messages', () => {
      const error1 = new Error('error one');
      const error2 = new Error('error two');
      expect(hasSameErrorIdentity(error1, error2)).toBe(false);
    });

    it('returns true for duplicate digests across different error instances', () => {
      const error1 = new Error('error one');
      error1.digest = 'dup-digest';
      const error2 = new Error('error two');
      error2.digest = 'dup-digest';
      expect(hasSameErrorIdentity(error1, error2)).toBe(true);
    });

    it('returns false when existing error has no identity', () => {
      const error1 = new Error('error one');
      expect(hasSameErrorIdentity(error1, new Error('error two'))).toBe(false);
    });

    it('returns false for undefined existing error', () => {
      expect(hasSameErrorIdentity(undefined, new Error('test'))).toBe(false);
    });
  });
});