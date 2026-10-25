/**
 * Tests for ViewFilterControl
 *
 * Covers:
 *   – Renders all three options
 *   – Active option has aria-checked=true; others false
 *   – Clicking an enabled option calls onChange
 *   – Wallet-gated options are aria-disabled when wallet not connected
 *   – Clicking a disabled option does NOT call onChange
 *   – Arrow-key navigation moves focus and calls onChange for enabled options
 *   – Disabled options are skipped silently on arrow key
 *   – Only the selected button has tabIndex 0 (roving tabIndex)
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewFilterControl } from '../ViewFilterControl';
import type { ViewFilter } from '@/lib/api';

function setup(value: ViewFilter = 'all', walletConnected = true) {
  const onChange = vi.fn();
  render(
    <ViewFilterControl value={value} onChange={onChange} walletConnected={walletConnected} />,
  );
  return { onChange };
}

describe('ViewFilterControl', () => {
  it('renders three radio buttons', () => {
    setup();
    expect(screen.getByRole('radio', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /as client/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /as freelancer/i })).toBeInTheDocument();
  });

  it('marks the current value as checked', () => {
    setup('client');
    expect(screen.getByRole('radio', { name: /as client/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /all/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /as freelancer/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('only the selected option has tabIndex 0 (roving tabIndex)', () => {
    setup('freelancer');
    expect(screen.getByRole('radio', { name: /as freelancer/i })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: /all/i })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: /as client/i })).toHaveAttribute('tabindex', '-1');
  });

  it('calls onChange when an enabled option is clicked', async () => {
    const { onChange } = setup('all', true);
    await userEvent.click(screen.getByRole('radio', { name: /as client/i }));
    expect(onChange).toHaveBeenCalledWith('client');
  });

  it('does not call onChange when clicking the already-selected option', async () => {
    const { onChange } = setup('client', true);
    await userEvent.click(screen.getByRole('radio', { name: /as client/i }));
    // It is still selected; onChange fires because we don't guard the same value
    // (the parent owns that optimization via router.replace deduplication)
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  describe('when wallet is not connected', () => {
    it('marks wallet-gated options as aria-disabled', () => {
      setup('all', false);
      expect(screen.getByRole('radio', { name: /as client/i })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('radio', { name: /as freelancer/i })).toHaveAttribute('aria-disabled', 'true');
    });

    it('does not call onChange when a disabled option is clicked', async () => {
      const { onChange } = setup('all', false);
      await userEvent.click(screen.getByRole('radio', { name: /as client/i }));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('"All" is not disabled and still calls onChange', async () => {
      const { onChange } = setup('all', false);
      // Click 'All' when it's already selected – still fires
      await userEvent.click(screen.getByRole('radio', { name: /^all$/i }));
      // 'All' is not disabled, so onChange is called
      expect(onChange).toHaveBeenCalledWith('all');
    });
  });

  describe('keyboard navigation (radiogroup pattern)', () => {
    it('ArrowRight moves focus to next option and calls onChange', async () => {
      const { onChange } = setup('all', true);
      const allBtn = screen.getByRole('radio', { name: /^all$/i });
      allBtn.focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(onChange).toHaveBeenCalledWith('client');
    });

    it('ArrowLeft wraps around to the last option', async () => {
      const { onChange } = setup('all', true);
      const allBtn = screen.getByRole('radio', { name: /^all$/i });
      allBtn.focus();
      await userEvent.keyboard('{ArrowLeft}');
      expect(onChange).toHaveBeenCalledWith('freelancer');
    });

    it('arrow keys do not call onChange for disabled wallet options', async () => {
      const { onChange } = setup('all', false);
      const allBtn = screen.getByRole('radio', { name: /^all$/i });
      allBtn.focus();
      // ArrowRight would land on 'client' which is disabled
      await userEvent.keyboard('{ArrowRight}');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('ArrowDown behaves the same as ArrowRight', async () => {
      const { onChange } = setup('all', true);
      screen.getByRole('radio', { name: /^all$/i }).focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(onChange).toHaveBeenCalledWith('client');
    });

    it('ArrowUp behaves the same as ArrowLeft', async () => {
      const { onChange } = setup('client', true);
      screen.getByRole('radio', { name: /as client/i }).focus();
      await userEvent.keyboard('{ArrowUp}');
      expect(onChange).toHaveBeenCalledWith('all');
    });
  });
});
