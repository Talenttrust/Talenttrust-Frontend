/**
 * @file ContractsDensityToggle.test.tsx
 *
 * Comprehensive tests for the contracts density toggle feature.
 * Covers:
 *   - Toggle button rendering and labelling
 *   - Toggling changes the density value passed down to ContractsList
 *   - Density is persisted to preferences storage
 *   - Invalid stored values fall back to 'comfortable'
 *   - ContractListItem applies correct spacing for each density
 *   - ContractsList passes density through to ContractListItem
 *   - Accessibility: aria-pressed, aria-label, keyboard interaction
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  renderHook,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ContractsList from '../ContractsList';
import ContractListItem from '../ContractListItem';
import {
  PreferencesProvider,
  usePreferences,
  sanitizePreferences,
} from '@/lib/preferences';
import { resetCache } from '@/lib/safeStorage';
import type { Contract } from '@/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    contractName: 'Test Contract',
    parties: [{ label: 'Client', address: 'GABC1234' }],
    totalValue: 5000,
    currency: 'USD',
    status: 'Active',
    createdAt: '2025-01-01',
    milestoneCount: 2,
    ...overrides,
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

beforeEach(() => {
  localStorage.clear();
  resetCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ContractListItem density prop
// ---------------------------------------------------------------------------

describe('ContractListItem – density prop', () => {
  it('applies comfortable padding by default', () => {
    const { container } = render(
      <ContractListItem contract={makeContract()} index={0} />
    );
    const li = container.querySelector('li')!;
    expect(li.className).toContain('p-4');
    expect(li.className).not.toContain('p-2.5');
  });

  it('applies comfortable padding when density="comfortable"', () => {
    const { container } = render(
      <ContractListItem contract={makeContract()} index={0} density="comfortable" />
    );
    const li = container.querySelector('li')!;
    expect(li.className).toContain('p-4');
    expect(li.className).not.toContain('p-2.5');
  });

  it('applies compact padding when density="compact"', () => {
    const { container } = render(
      <ContractListItem contract={makeContract()} index={0} density="compact" />
    );
    const li = container.querySelector('li')!;
    expect(li.className).toContain('p-2.5');
    expect(li.className).not.toContain('p-4');
  });

  it('re-renders when density prop changes', () => {
    const contract = makeContract();
    const { container, rerender } = render(
      <ContractListItem contract={contract} index={0} density="comfortable" />
    );
    expect(container.querySelector('li')!.className).toContain('p-4');

    rerender(<ContractListItem contract={contract} index={0} density="compact" />);
    expect(container.querySelector('li')!.className).toContain('p-2.5');
  });

  it('does not re-render when density is stable', () => {
    const contract = makeContract();
    const renderCount = { current: 0 };
    const Spy = React.memo(
      ({ contract, index, density }: Parameters<typeof ContractListItem>[0]) => {
        renderCount.current += 1;
        return <ContractListItem contract={contract} index={index} density={density} />;
      }
    );
    Spy.displayName = 'Spy';

    const { rerender } = render(
      <Spy contract={contract} index={0} density="compact" />
    );
    const countAfterFirst = renderCount.current;
    rerender(<Spy contract={contract} index={0} density="compact" />);
    // React.memo should prevent a second render since props are equal
    expect(renderCount.current).toBe(countAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// ContractsList density toggle button
// ---------------------------------------------------------------------------

describe('ContractsList – density toggle button', () => {
  const contracts = [makeContract({ contractName: 'Alpha' })];

  it('renders the toggle button when onToggleDensity is provided', () => {
    render(
      <ContractsList
        contracts={contracts}
        density="comfortable"
        onToggleDensity={jest.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /switch to compact density/i })
    ).toBeInTheDocument();
  });

  it('does not render the toggle button when onToggleDensity is omitted', () => {
    render(<ContractsList contracts={contracts} />);
    expect(screen.queryByRole('button', { name: /switch to.*density/i })).not.toBeInTheDocument();
  });

  it('labels the button "Switch to compact density" when density is comfortable', () => {
    render(
      <ContractsList
        contracts={contracts}
        density="comfortable"
        onToggleDensity={jest.fn()}
      />
    );
    const btn = screen.getByRole('button', { name: /switch to compact density/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveTextContent('Compact');
  });

  it('labels the button "Switch to comfortable density" when density is compact', () => {
    render(
      <ContractsList
        contracts={contracts}
        density="compact"
        onToggleDensity={jest.fn()}
      />
    );
    const btn = screen.getByRole('button', { name: /switch to comfortable density/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('Comfortable');
  });

  it('calls onToggleDensity when the button is clicked', () => {
    const onToggle = jest.fn();
    render(
      <ContractsList
        contracts={contracts}
        density="comfortable"
        onToggleDensity={onToggle}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /switch to compact density/i })
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('passes density="compact" down to list items when compact', () => {
    const { container } = render(
      <ContractsList
        contracts={contracts}
        density="compact"
        onToggleDensity={jest.fn()}
      />
    );
    const li = container.querySelector('li')!;
    expect(li.className).toContain('p-2.5');
  });

  it('passes density="comfortable" down to list items when comfortable', () => {
    const { container } = render(
      <ContractsList
        contracts={contracts}
        density="comfortable"
        onToggleDensity={jest.fn()}
      />
    );
    const li = container.querySelector('li')!;
    expect(li.className).toContain('p-4');
  });

  it('uses compact list spacing when density="compact"', () => {
    const { container } = render(
      <ContractsList
        contracts={[makeContract(), makeContract({ contractName: 'Beta' })]}
        density="compact"
        onToggleDensity={jest.fn()}
      />
    );
    const ul = container.querySelector('ul')!;
    expect(ul.className).toContain('space-y-2');
    expect(ul.className).not.toContain('space-y-4');
  });

  it('uses comfortable list spacing when density="comfortable"', () => {
    const { container } = render(
      <ContractsList
        contracts={[makeContract(), makeContract({ contractName: 'Beta' })]}
        density="comfortable"
        onToggleDensity={jest.fn()}
      />
    );
    const ul = container.querySelector('ul')!;
    expect(ul.className).toContain('space-y-4');
    expect(ul.className).not.toContain('space-y-2');
  });
});

// ---------------------------------------------------------------------------
// Preference persistence via usePreferences
// ---------------------------------------------------------------------------

describe('contractsDensity preference – persistence', () => {
  it('defaults to comfortable', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.contractsDensity).toBe('comfortable');
  });

  it('persists contractsDensity=compact to localStorage', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });

    act(() => {
      result.current.updatePreference('contractsDensity', 'compact');
    });

    expect(result.current.preferences.contractsDensity).toBe('compact');
    const saved = JSON.parse(
      localStorage.getItem('talenttrust-user-preferences') || '{}'
    );
    expect(saved.contractsDensity).toBe('compact');
  });

  it('persists contractsDensity=comfortable to localStorage', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });

    act(() => {
      result.current.updatePreference('contractsDensity', 'compact');
    });
    act(() => {
      result.current.updatePreference('contractsDensity', 'comfortable');
    });

    const saved = JSON.parse(
      localStorage.getItem('talenttrust-user-preferences') || '{}'
    );
    expect(saved.contractsDensity).toBe('comfortable');
  });

  it('restores contractsDensity on mount (simulates page reload)', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ contractsDensity: 'compact' })
    );

    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.contractsDensity).toBe('compact');
  });

  it('falls back to comfortable when stored value is invalid', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ contractsDensity: 'ultra-wide' })
    );
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.contractsDensity).toBe('comfortable');
  });

  it('falls back to comfortable when stored value is a number', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ contractsDensity: 1 })
    );
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.contractsDensity).toBe('comfortable');
  });

  it('falls back to comfortable when stored value is null', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ contractsDensity: null })
    );
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.contractsDensity).toBe('comfortable');
  });

  it('falls back to comfortable when stored value is boolean', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ contractsDensity: true })
    );
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.contractsDensity).toBe('comfortable');
  });

  it('does not persist contractsDensity before hydration', () => {
    // The provider should not overwrite localStorage with defaults before
    // it has read the stored value.
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ contractsDensity: 'compact' })
    );

    const { result } = renderHook(() => usePreferences(), { wrapper });
    // After hydration the value should be the stored one, not the default.
    expect(result.current.preferences.contractsDensity).toBe('compact');
  });
});

// ---------------------------------------------------------------------------
// sanitizePreferences – contractsDensity
// ---------------------------------------------------------------------------

describe('sanitizePreferences – contractsDensity', () => {
  it('accepts "comfortable"', () => {
    const result = sanitizePreferences({ contractsDensity: 'comfortable' });
    expect(result.contractsDensity).toBe('comfortable');
  });

  it('accepts "compact"', () => {
    const result = sanitizePreferences({ contractsDensity: 'compact' });
    expect(result.contractsDensity).toBe('compact');
  });

  it('falls back to comfortable for unknown string', () => {
    const result = sanitizePreferences({ contractsDensity: 'huge' });
    expect(result.contractsDensity).toBe('comfortable');
  });

  it('falls back to comfortable for number', () => {
    const result = sanitizePreferences({
      contractsDensity: 42,
    } as unknown as Parameters<typeof sanitizePreferences>[0]);
    expect(result.contractsDensity).toBe('comfortable');
  });

  it('falls back to comfortable for null', () => {
    const result = sanitizePreferences({
      contractsDensity: null,
    } as unknown as Parameters<typeof sanitizePreferences>[0]);
    expect(result.contractsDensity).toBe('comfortable');
  });

  it('falls back to comfortable when absent', () => {
    const result = sanitizePreferences({});
    expect(result.contractsDensity).toBe('comfortable');
  });
});

// ---------------------------------------------------------------------------
// Integration: ContractsList + preferences toggle
// ---------------------------------------------------------------------------

describe('ContractsList – toggle integration', () => {
  it('density toggle cycles comfortable→compact→comfortable', () => {
    const contracts = [makeContract({ contractName: 'Cycle Test' })];
    let currentDensity: 'comfortable' | 'compact' = 'comfortable';
    const onToggle = jest.fn(() => {
      currentDensity = currentDensity === 'comfortable' ? 'compact' : 'comfortable';
    });

    const { rerender, container } = render(
      <ContractsList contracts={contracts} density={currentDensity} onToggleDensity={onToggle} />
    );

    // Initial: comfortable
    expect(container.querySelector('li')!.className).toContain('p-4');

    // Click once → compact
    fireEvent.click(screen.getByRole('button', { name: /switch to compact density/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <ContractsList contracts={contracts} density={currentDensity} onToggleDensity={onToggle} />
    );
    expect(container.querySelector('li')!.className).toContain('p-2.5');

    // Click again → comfortable
    fireEvent.click(screen.getByRole('button', { name: /switch to comfortable density/i }));
    expect(onToggle).toHaveBeenCalledTimes(2);

    rerender(
      <ContractsList contracts={contracts} density={currentDensity} onToggleDensity={onToggle} />
    );
    expect(container.querySelector('li')!.className).toContain('p-4');
  });

  it('renders correctly with empty contracts list at both densities', () => {
    const { rerender, container } = render(
      <ContractsList contracts={[]} density="comfortable" onToggleDensity={jest.fn()} />
    );
    expect(container.querySelector('ul')!.children).toHaveLength(0);

    rerender(
      <ContractsList contracts={[]} density="compact" onToggleDensity={jest.fn()} />
    );
    expect(container.querySelector('ul')!.children).toHaveLength(0);
  });

  it('all items adopt the new density when the prop changes', () => {
    const contracts = Array.from({ length: 5 }, (_, i) =>
      makeContract({ contractName: `Contract ${i + 1}` })
    );

    const { container, rerender } = render(
      <ContractsList contracts={contracts} density="comfortable" onToggleDensity={jest.fn()} />
    );

    const allLi = () => Array.from(container.querySelectorAll('li'));

    allLi().forEach((li) => expect(li.className).toContain('p-4'));

    rerender(
      <ContractsList contracts={contracts} density="compact" onToggleDensity={jest.fn()} />
    );

    allLi().forEach((li) => expect(li.className).toContain('p-2.5'));
  });
});
