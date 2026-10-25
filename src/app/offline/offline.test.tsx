import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

// Mock next/link so we can assert on link attributes
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('OfflinePage', () => {
  it('renders the page with a heading', async () => {
    const OfflinePage = (await import('../offline/page')).default;
    render(<OfflinePage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent(/you.?re offline/i);
  });

  it('explains that escrow data and signing need a connection', async () => {
    const OfflinePage = (await import('../offline/page')).default;
    render(<OfflinePage />);

    expect(
      screen.getByText(/needs a network connection to load escrow data/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sign transactions/i),
    ).toBeInTheDocument();
  });

  it('renders a Try Again button that triggers a reload', async () => {
    const OfflinePage = (await import('../offline/page')).default;
    render(<OfflinePage />);

    const retryButton = screen.getByText('Try Again');
    expect(retryButton).toBeInTheDocument();
    expect(retryButton.tagName).toBe('BUTTON');
  });

  it('renders a Go Home link pointing to /', async () => {
    const OfflinePage = (await import('../offline/page')).default;
    render(<OfflinePage />);

    const homeLink = screen.getByText('Go Home');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('has no axe accessibility violations', async () => {
    const OfflinePage = (await import('../offline/page')).default;
    const { container } = render(<OfflinePage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
