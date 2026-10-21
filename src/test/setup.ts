import '@testing-library/jest-dom/vitest';
import * as matchers from 'vitest-axe/matchers';
import { expect } from 'vitest';

expect.extend(matchers);

interface CustomAxeMatchers {
  toHaveNoViolations(): void;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomAxeMatchers {}
  interface AsymmetricMatchersContaining extends CustomAxeMatchers {}
}
