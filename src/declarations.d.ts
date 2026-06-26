interface Window {
  freighter?: boolean;
}

declare module 'jest-axe' {
  export interface JestAxeOptions {
    [key: string]: unknown;
  }

  export interface AxeResults {
    violations: Array<{
      id: string;
      impact?: string;
      description: string;
      help: string;
      helpUrl: string;
      nodes: Array<Record<string, unknown>>;
    }>;
    passes: Array<Record<string, unknown>>;
    incomplete: Array<Record<string, unknown>>;
    inapplicable: Array<Record<string, unknown>>;
    url: string;
    timestamp: string;
  }

  export function axe(
    html: Element | Document,
    options?: JestAxeOptions
  ): Promise<AxeResults>;

  export function configureAxe(options?: JestAxeOptions): typeof axe;

  export const toHaveNoViolations: {
    toHaveNoViolations(this: jest.MatcherContext, results: AxeResults): jest.CustomMatcherResult;
  };
}

namespace jest {
  interface Matchers<R> {
    toHaveNoViolations(): R;
  }
}
