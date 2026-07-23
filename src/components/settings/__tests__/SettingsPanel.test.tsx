import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SettingsPanel } from '../SettingsPanel';
import { PreferencesProvider } from '@/lib/preferences';
import { resetCache } from '@/lib/safeStorage';


const renderWithProvider = (ui: React.ReactElement) => {
  return render(
    <PreferencesProvider>
      {ui}
    </PreferencesProvider>
  );
};

/**
 * Return the current text content of the aria-live announcement region.
 */
function getAnnouncementText(): string {
  const region = screen.getByRole('status');
  return region.textContent ?? '';
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders nothing when closed', () => {
    const { container } = renderWithProvider(
      <SettingsPanel isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when open', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Notifications')).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    renderWithProvider(<SettingsPanel isOpen={true} onClose={onClose} />);
    
    const closeButton = screen.getByRole('button', { name: /Close settings/i });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('updates theme preference when theme button is clicked', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    
    const darkButton = screen.getByRole('radio', { name: /dark/i });
    fireEvent.click(darkButton);
    
    // Check if it's active
    expect(darkButton.getAttribute('aria-checked')).toBe('true');
    expect(darkButton.className).toContain('bg-[var(--primary)]');
  });

  it('updates currency preference when currency button is clicked', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    
    const ngnButton = screen.getByRole('radio', { name: /ngn/i });
    fireEvent.click(ngnButton);
    
    expect(ngnButton.getAttribute('aria-checked')).toBe('true');
  });

  it('updates toast density preference', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

    // Scope to the Toast Density radiogroup to avoid collision with the
    // "compact" option that also exists in the Currency Display group.
    const densityGroup = screen.getByRole('radiogroup', { name: /toast density/i });
    const compactButton = within(densityGroup).getByRole('radio', { name: /compact/i });
    fireEvent.click(compactButton);

    expect(compactButton.getAttribute('aria-checked')).toBe('true');
  });

  it('toggles quiet mode switch', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    
    const quietSwitch = screen.getByRole('switch', { name: /Quiet Mode/i });
    expect(quietSwitch.getAttribute('aria-checked')).toBe('false');
    
    fireEvent.click(quietSwitch);
    expect(quietSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('persists theme preference to localStorage when changed', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

    const darkButton = screen.getByRole('radio', { name: /dark/i });
    fireEvent.click(darkButton);

    const saved = JSON.parse(
      localStorage.getItem('talenttrust-user-preferences') || '{}'
    );
    expect(saved.theme).toBe('dark');
  });

  it('persists currency preference to localStorage when changed', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

    const ngnButton = screen.getByRole('radio', { name: /ngn/i });
    fireEvent.click(ngnButton);

    const saved = JSON.parse(
      localStorage.getItem('talenttrust-user-preferences') || '{}'
    );
    expect(saved.amountFormat).toBe('ngn');
  });

  it('persists quietMode to localStorage when toggled', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

    const quietSwitch = screen.getByRole('switch', { name: /Quiet Mode/i });
    fireEvent.click(quietSwitch);

    const saved = JSON.parse(
      localStorage.getItem('talenttrust-user-preferences') || '{}'
    );
    expect(saved.quietMode).toBe(true);
  });

  it('persists toastDensity preference to localStorage when changed', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

    const densityGroup = screen.getByRole('radiogroup', { name: /toast density/i });
    const compactButton = within(densityGroup).getByRole('radio', { name: /compact/i });
    fireEvent.click(compactButton);

    const saved = JSON.parse(
      localStorage.getItem('talenttrust-user-preferences') || '{}'
    );
    expect(saved.toastDensity).toBe('compact');
  });

  it('restores preferences from localStorage on remount (simulated reload)', () => {
    // Pre-seed localStorage as if a previous session saved dark + NGN
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ theme: 'dark', amountFormat: 'ngn', toastDensity: 'compact', quietMode: true })
    );

    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

    // Theme: dark should be checked
    const themeGroup = screen.getByRole('radiogroup', { name: /theme/i });
    expect(within(themeGroup).getByRole('radio', { name: /dark/i }).getAttribute('aria-checked')).toBe('true');
    expect(within(themeGroup).getByRole('radio', { name: /light/i }).getAttribute('aria-checked')).toBe('false');

    // Currency: ngn should be checked
    const currencyGroup = screen.getByRole('radiogroup', { name: /currency display/i });
    expect(within(currencyGroup).getByRole('radio', { name: /ngn/i }).getAttribute('aria-checked')).toBe('true');

    // Toast density: compact should be checked
    const densityGroup = screen.getByRole('radiogroup', { name: /toast density/i });
    expect(within(densityGroup).getByRole('radio', { name: /compact/i }).getAttribute('aria-checked')).toBe('true');

    // Quiet mode: on
    expect(screen.getByRole('switch', { name: /quiet mode/i }).getAttribute('aria-checked')).toBe('true');
  });

  it('closes when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = renderWithProvider(
      <SettingsPanel isOpen={true} onClose={onClose} />
    );

    // The backdrop is the first child of the outer wrapper
    const backdrop = container.querySelector('.absolute.inset-0');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when Done button is clicked', () => {
    const onClose = jest.fn();
    renderWithProvider(<SettingsPanel isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('all interactive controls are keyboard-accessible (have focus-visible ring classes)', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

    const focusableControls = [
      screen.getByRole('button', { name: /close settings/i }),
      screen.getByRole('switch', { name: /quiet mode/i }),
      screen.getByRole('button', { name: /done/i }),
    ];

    focusableControls.forEach((el) => {
      expect(el.className).toMatch(/focus-visible/);
    });
  });

  // --- Accessibility: dialog semantics ---

  it('has role="dialog" when open', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('has aria-modal="true" on the dialog', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });

  it('aria-labelledby points to the "Settings" heading', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const heading = document.getElementById(labelId!);
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe('Settings');
  });

  // --- Accessibility: keyboard interactions ---

  it('closes when Escape is pressed', () => {
    const onClose = jest.fn();
    renderWithProvider(<SettingsPanel isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('sets initial focus on the close button when opened', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /close settings/i })
    );
  });

  it('Tab on the last focusable element wraps focus to the first', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it('Shift+Tab on the first focusable element wraps focus to the last', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    const first = focusable[0];
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  // --- Accessibility validation with jest-axe ---

  it('passes accessibility audit with jest-axe when open', async () => {
    jest.useRealTimers();
    const { container } = renderWithProvider(
      <SettingsPanel isOpen={true} onClose={() => {}} />
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes accessibility audit with jest-axe when closed', async () => {
    jest.useRealTimers();
    const { container } = renderWithProvider(
      <SettingsPanel isOpen={false} onClose={() => {}} />
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });



  // --- Edge cases for focus management ---

  it('does not call onClose when Escape is pressed while dialog is closed', () => {
    const onClose = jest.fn();
    renderWithProvider(<SettingsPanel isOpen={false} onClose={onClose} />);
    
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('initial focus is not set when panel is not open', () => {
    renderWithProvider(<SettingsPanel isOpen={false} onClose={() => {}} />);
    
    // Should not have any dialog content
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.queryByRole('button', { name: /close settings/i }));
  });

  // --- Verify all preference controls are properly labeled ---

  it('all preference controls have proper ARIA labels and roles', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    
    // Theme radiogroup
    const themeGroup = screen.getByRole('radiogroup', { name: /theme/i });
    expect(themeGroup).toBeInTheDocument();
    
    // Currency radiogroup
    const currencyGroup = screen.getByRole('radiogroup', { name: /currency display/i });
    expect(currencyGroup).toBeInTheDocument();
    
    // Toast density radiogroup
    const densityGroup = screen.getByRole('radiogroup', { name: /toast density/i });
    expect(densityGroup).toBeInTheDocument();
    
    // Quiet mode switch
    const quietSwitch = screen.getByRole('switch', { name: /quiet mode/i });
    expect(quietSwitch).toBeInTheDocument();
    
    // All theme radio buttons should be properly labeled
    const themeButtons = within(themeGroup).getAllByRole('radio');
    expect(themeButtons).toHaveLength(3);
    expect(themeButtons[0]).toHaveAccessibleName('light');
    expect(themeButtons[1]).toHaveAccessibleName('dark');
    expect(themeButtons[2]).toHaveAccessibleName('system');
  });

  // ------------------------------------------------------------------
  // aria-live announcement region tests
  // ------------------------------------------------------------------

  describe('aria-live announcements', () => {
    it('does not announce anything on mount (empty live region)', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      // Even after the debounce window passes, nothing should appear.
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getAnnouncementText()).toBe('');
    });

    it('announces a single preference change after debounce', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      fireEvent.click(screen.getByRole('radio', { name: /dark/i }));

      // Before debounce — still empty.
      expect(getAnnouncementText()).toBe('');

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getAnnouncementText()).toContain('Theme changed to dark');
    });

    it('includes the "Settings updated:" prefix', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      fireEvent.click(screen.getByRole('radio', { name: /light/i }));

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getAnnouncementText()).toMatch(/^Settings updated:/);
    });

    it('announces theme changes with correct wording', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      // Start from default 'system' → click 'dark'
      fireEvent.click(screen.getByRole('radio', { name: /dark/i }));
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(getAnnouncementText()).toContain('Theme changed to dark');
    });

    it('announces currency format changes with correct wording', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      fireEvent.click(screen.getByRole('radio', { name: /ngn/i }));
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getAnnouncementText()).toContain('Currency format changed to ngn');
    });

    it('announces toast density changes with correct wording', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      const densityGroup = screen.getByRole('radiogroup', { name: /toast density/i });
      fireEvent.click(within(densityGroup).getByRole('radio', { name: /compact/i }));
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getAnnouncementText()).toContain('Toast density changed to compact');
    });

    it('announces quiet mode enabled', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      fireEvent.click(screen.getByRole('switch', { name: /quiet mode/i }));
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getAnnouncementText()).toContain('Quiet mode enabled');
    });

    it('announces quiet mode disabled', () => {
      // Seed with quietMode already on so toggling disables it.
      localStorage.setItem(
        'talenttrust-user-preferences',
        JSON.stringify({ quietMode: true }),
      );

      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      fireEvent.click(screen.getByRole('switch', { name: /quiet mode/i }));
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getAnnouncementText()).toContain('Quiet mode disabled');
    });

    it('debounces rapid successive updates into one combined announcement', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      // Fire three changes in quick succession
      fireEvent.click(screen.getByRole('radio', { name: /dark/i }));
      fireEvent.click(screen.getByRole('radio', { name: /ngn/i }));
      fireEvent.click(screen.getByRole('switch', { name: /quiet mode/i }));

      // After a short time (within debounce window), nothing announced yet.
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(getAnnouncementText()).toBe('');

      // After full debounce, a single announcement covers all changes.
      act(() => {
        jest.advanceTimersByTime(300);
      });

      const text = getAnnouncementText();
      expect(text).toContain('Theme changed to dark');
      expect(text).toContain('Currency format changed to ngn');
      expect(text).toContain('Quiet mode enabled');
      // Ensure there is exactly one "Settings updated:" prefix (combined).
      expect(text.split('Settings updated:').length).toBe(2);
    });

    it('does not announce when clicking the already-active option (zero changes)', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      // Default theme is 'system'; click 'system' radio.
      fireEvent.click(screen.getByRole('radio', { name: /^system$/i }));

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getAnnouncementText()).toBe('');
    });

    it('live region has correct ARIA attributes', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      const region = screen.getByRole('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.getAttribute('aria-atomic')).toBe('true');
    });

    it('live region is visually hidden (sr-only)', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      const region = screen.getByRole('status');
      expect(region.className).toContain('sr-only');
    });

    it('does not announce when rapid toggling results in no net change', () => {
      renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);

      // Rapidly toggle quiet mode twice (on then off) — net change is zero.
      const quietSwitch = screen.getByRole('switch', { name: /quiet mode/i });
      fireEvent.click(quietSwitch); // off → on
      fireEvent.click(quietSwitch); // on → off

      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Net zero change → nothing to announce.
      expect(getAnnouncementText()).toBe('');
    });

    it('does not announce when panel is closed (no render)', () => {
      renderWithProvider(
        <SettingsPanel isOpen={false} onClose={() => {}} />,
      );

      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
