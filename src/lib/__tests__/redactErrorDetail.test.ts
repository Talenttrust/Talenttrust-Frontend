import {
  REDACTED_ADDRESS,
  REDACTED_STACK,
  REDACTED_URL,
  getErrorMessage,
  prepareErrorDetailForDom,
  redactErrorDetail,
} from '../redactErrorDetail';

/** Structurally valid-looking Stellar G-address (56 chars) for redaction tests. */
const SAMPLE_G_ADDRESS =
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

describe('redactErrorDetail', () => {
  it('redacts Stellar G-addresses', () => {
    const input = `Wallet failed for ${SAMPLE_G_ADDRESS}`;
    expect(redactErrorDetail(input)).toBe(`Wallet failed for ${REDACTED_ADDRESS}`);
    expect(redactErrorDetail(input)).not.toContain(SAMPLE_G_ADDRESS);
  });

  it('redacts absolute http(s) URLs', () => {
    const input = 'Fetch failed at https://api.example.com/v1/wallets?id=1';
    const out = redactErrorDetail(input);
    expect(out).toContain(REDACTED_URL);
    expect(out).not.toContain('https://');
  });

  it('redacts stack-trace lines', () => {
    const input = [
      'TypeError: boom',
      '    at SafeBoundary.render (src/components/SafeBoundary.tsx:40:11)',
      '    at renderWithHooks (node_modules/react-dom/cjs/react-dom.development.js:1:1)',
    ].join('\n');
    const out = redactErrorDetail(input);
    expect(out).toContain('TypeError: boom');
    expect(out).toContain(REDACTED_STACK);
    expect(out).not.toContain('SafeBoundary.tsx');
    expect(out).not.toContain('node_modules');
  });

  it('redacts mixed sensitive fragments in one string', () => {
    const input = [
      `Payment to ${SAMPLE_G_ADDRESS} failed via https://horizon.example/tx`,
      '    at pay (src/lib/pay.ts:12:3)',
    ].join('\n');
    const out = redactErrorDetail(input);
    expect(out).not.toContain(SAMPLE_G_ADDRESS);
    expect(out).not.toContain('https://');
    expect(out).not.toContain('pay.ts');
    expect(out).toContain(REDACTED_ADDRESS);
    expect(out).toContain(REDACTED_URL);
    expect(out).toContain(REDACTED_STACK);
  });

  it('returns empty input unchanged', () => {
    expect(redactErrorDetail('')).toBe('');
  });
});

describe('prepareErrorDetailForDom', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = originalEnv;
  });

  it('keeps an unredacted path outside production', () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'development';
    const raw = `Leak ${SAMPLE_G_ADDRESS} https://secret.example/x`;
    expect(prepareErrorDetailForDom(raw)).toBe(raw);
  });

  it('always redacts in production builds', () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'production';
    const raw = `Leak ${SAMPLE_G_ADDRESS} at https://secret.example/x`;
    const out = prepareErrorDetailForDom(raw);
    expect(out).not.toContain(SAMPLE_G_ADDRESS);
    expect(out).not.toContain('https://');
    expect(out).toContain(REDACTED_ADDRESS);
    expect(out).toContain(REDACTED_URL);
  });
});

describe('getErrorMessage', () => {
  it('reads Error.message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies plain strings', () => {
    expect(getErrorMessage('plain')).toBe('plain');
  });

  it('JSON-stringifies plain objects', () => {
    expect(getErrorMessage({ code: 42 })).toBe('{"code":42}');
  });

  it('falls back to String() when JSON.stringify throws', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(getErrorMessage(cyclic)).toBe(String(cyclic));
  });
});
