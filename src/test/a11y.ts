import { createElement, type ReactElement, type ReactNode } from 'react';
import type { RunOptions } from 'axe-core';
import { render, type RenderResult } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { SwrProvider } from '@/lib/swr';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { NotificationsProvider } from '@/components/NotificationsProvider';

type A11yOptions = {
  rules?: RunOptions['rules'];
  prepare?: (view: RenderResult) => unknown | Promise<unknown>;
};

function TestProviders({ children }: { children: ReactNode }) {
  return createElement(
    ToastProvider,
    null,
    createElement(
      WalletProvider,
      null,
      createElement(
        SwrProvider,
        { value: { shouldRetryOnError: () => false, revalidateOnFocus: false } },
        createElement(
          ConfirmProvider,
          null,
          createElement(NotificationsProvider, { poller: { intervalMs: 60_000 } }, children),
        ),
      ),
    ),
  );
}

export async function expectNoA11yViolations(
  ui: ReactElement,
  { rules, prepare }: A11yOptions = {},
): Promise<RenderResult> {
  const view = render(ui, { wrapper: TestProviders });
  await prepare?.(view);

  const results = await axe(view.container, {
    rules: {
      // jsdom has no layout or computed rendering information for color contrast.
      'color-contrast': { enabled: false },
      ...rules,
    },
  });

  if (results.violations.length > 0) {
    const summary = results.violations
      .map((violation) => {
        const nodes = violation.nodes
          .map((node) => `  ${node.target.join(', ')}: ${node.failureSummary ?? node.html}`)
          .join('\n');
        return `- ${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n${nodes}`;
      })
      .join('\n');
    throw new Error(`Accessibility violations found:\n${summary}`);
  }

  return view;
}
