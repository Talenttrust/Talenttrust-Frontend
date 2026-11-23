import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ResolveDisputeForm,
  parsePercent,
  previewSplit,
} from './ResolveDisputeForm';

describe('previewSplit', () => {
  it('handles boundaries (0 bps, 10000 bps, 0 held, max safe integer)', () => {
    expect(previewSplit(1000, 0)).toEqual({ freelancer: 0, client: 1000 });
    expect(previewSplit(1000, 10000)).toEqual({ freelancer: 1000, client: 0 });
    expect(previewSplit(0, 0)).toEqual({ freelancer: 0, client: 0 });
    expect(previewSplit(0, 5000)).toEqual({ freelancer: 0, client: 0 });
    expect(previewSplit(0, 10000)).toEqual({ freelancer: 0, client: 0 });

    const maxSafe = Number.MAX_SAFE_INTEGER;
    const splitMax = previewSplit(maxSafe, 5000);
    expect(splitMax.freelancer + splitMax.client).toBe(maxSafe);
  });

  it('allocates odd amounts so dust stays with the client', () => {
    expect(previewSplit(1, 5000)).toEqual({ freelancer: 0, client: 1 });
    expect(previewSplit(3, 5000)).toEqual({ freelancer: 1, client: 2 });
    expect(previewSplit(101, 5000)).toEqual({ freelancer: 50, client: 51 });
    expect(previewSplit(100, 3333)).toEqual({ freelancer: 33, client: 67 });
    expect(previewSplit(1000, 3333)).toEqual({ freelancer: 333, client: 667 });

    const split = previewSplit(999, 3333);
    expect(split.freelancer + split.client).toBe(999);
  });

  it('throws RangeError for non-integer inputs', () => {
    expect(() => previewSplit(10.5, 5000)).toThrow(RangeError);
    expect(() => previewSplit(10.5, 5000)).toThrow('Held amount must be a non-negative safe integer.');
    expect(() => previewSplit(NaN, 5000)).toThrow(RangeError);
    expect(() => previewSplit(Infinity, 5000)).toThrow(RangeError);

    expect(() => previewSplit(1000, 50.5)).toThrow(RangeError);
    expect(() => previewSplit(1000, 50.5)).toThrow('Freelancer share must be an integer from 0 to 10000 basis points.');
    expect(() => previewSplit(1000, NaN)).toThrow(RangeError);
    expect(() => previewSplit(1000, Infinity)).toThrow(RangeError);
  });

  it('throws RangeError for out-of-range inputs', () => {
    expect(() => previewSplit(-1, 5000)).toThrow(RangeError);
    expect(() => previewSplit(-1, 5000)).toThrow('Held amount must be a non-negative safe integer.');
    expect(() => previewSplit(Number.MAX_SAFE_INTEGER + 1, 5000)).toThrow(RangeError);

    expect(() => previewSplit(1000, -1)).toThrow(RangeError);
    expect(() => previewSplit(1000, -1)).toThrow('Freelancer share must be an integer from 0 to 10000 basis points.');
    expect(() => previewSplit(1000, 10001)).toThrow(RangeError);
    expect(() => previewSplit(1000, 10001)).toThrow('Freelancer share must be an integer from 0 to 10000 basis points.');
  });
});

describe('parsePercent', () => {
  it('parses valid integer percentages into basis points', () => {
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('1')).toBe(100);
    expect(parsePercent('50')).toBe(5000);
    expect(parsePercent('100')).toBe(10000);
  });

  it('parses percentages with up to two decimal places', () => {
    expect(parsePercent('0.5')).toBe(50);
    expect(parsePercent('0.05')).toBe(5);
    expect(parsePercent('0.01')).toBe(1);
    expect(parsePercent('.5')).toBe(50);
    expect(parsePercent('.05')).toBe(5);
    expect(parsePercent('25.5')).toBe(2550);
    expect(parsePercent('33.33')).toBe(3333);
    expect(parsePercent('99.99')).toBe(9999);
    expect(parsePercent('100.00')).toBe(10000);
    expect(parsePercent('100.0')).toBe(10000);
    expect(parsePercent('50.')).toBe(5000);
  });

  it('rejects numbers with more than two decimal places', () => {
    expect(parsePercent('50.123')).toBeNull();
    expect(parsePercent('0.001')).toBeNull();
    expect(parsePercent('12.3456')).toBeNull();
    expect(parsePercent('.123')).toBeNull();
  });

  it('rejects values out of the 0 to 100 range', () => {
    expect(parsePercent('-1')).toBeNull();
    expect(parsePercent('-0.01')).toBeNull();
    expect(parsePercent('100.01')).toBeNull();
    expect(parsePercent('101')).toBeNull();
    expect(parsePercent('999')).toBeNull();
  });

  it('rejects non-numeric or malformed strings', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('   ')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(parsePercent('50%')).toBeNull();
    expect(parsePercent('1.2.3')).toBeNull();
    expect(parsePercent('1e2')).toBeNull();
  });
});

describe('ResolveDisputeForm', () => {
  const defaultProps = {
    id: 42,
    held: 1000,
    token: 'USDC',
    busy: false,
    onResolve: vi.fn().mockResolvedValue(undefined),
  };

  function renderForm(props = {}) {
    return render(<ResolveDisputeForm {...defaultProps} {...props} />);
  }

  beforeEach(() => {
    defaultProps.onResolve.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial state with 50% split and enabled review button', () => {
    renderForm();

    const input = screen.getByLabelText('Freelancer share', { selector: 'input.input' });
    expect(input).toHaveValue(50);
    expect(screen.getAllByText('500 USDC')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Review resolution' })).toBeEnabled();
  });

  it('updates the percent field and split preview when preset buttons are clicked', () => {
    renderForm();

    const input = screen.getByLabelText('Freelancer share', { selector: 'input.input' });
    const btn0 = screen.getByRole('button', { name: '0%' });
    const btn25 = screen.getByRole('button', { name: '25%' });
    const btn75 = screen.getByRole('button', { name: '75%' });
    const btn100 = screen.getByRole('button', { name: '100%' });

    fireEvent.click(btn0);
    expect(input).toHaveValue(0);
    expect(btn0).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('0 USDC')).toBeInTheDocument();
    expect(screen.getByText('1,000 USDC')).toBeInTheDocument();

    fireEvent.click(btn25);
    expect(input).toHaveValue(25);
    expect(btn25).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('250 USDC')).toBeInTheDocument();
    expect(screen.getByText('750 USDC')).toBeInTheDocument();

    fireEvent.click(btn75);
    expect(input).toHaveValue(75);
    expect(btn75).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('750 USDC')).toBeInTheDocument();
    expect(screen.getByText('250 USDC')).toBeInTheDocument();

    fireEvent.click(btn100);
    expect(input).toHaveValue(100);
    expect(btn100).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1,000 USDC')).toBeInTheDocument();
    expect(screen.getByText('0 USDC')).toBeInTheDocument();
  });

  it('updates split when the slider is moved', () => {
    renderForm();

    const slider = screen.getByLabelText('Freelancer share', { selector: 'input.resolve-slider' });
    fireEvent.change(slider, { target: { value: '2500' } });

    const input = screen.getByLabelText('Freelancer share', { selector: 'input.input' });
    expect(input).toHaveValue(25);
    expect(screen.getByText('250 USDC')).toBeInTheDocument();
    expect(screen.getByText('750 USDC')).toBeInTheDocument();
  });

  it('disables review and shows error when percent text is invalid', () => {
    renderForm();

    const input = screen.getByLabelText('Freelancer share', { selector: 'input.input' });
    const reviewBtn = screen.getByRole('button', { name: 'Review resolution' });

    fireEvent.change(input, { target: { value: '12.345' } });
    expect(reviewBtn).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a percentage from 0 to 100 with up to two decimal places.',
    );

    fireEvent.change(input, { target: { value: '105' } });
    expect(reviewBtn).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(input, { target: { value: '-5' } });
    expect(reviewBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: '33.33' } });
    expect(reviewBtn).toBeEnabled();
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('enters confirmation and calls onResolve with exact basis points', async () => {
    renderForm();

    const input = screen.getByLabelText('Freelancer share', { selector: 'input.input' });
    fireEvent.change(input, { target: { value: '33.33' } });

    fireEvent.click(screen.getByRole('button', { name: 'Review resolution' }));

    expect(
      screen.getByText('Confirm: freelancer receives 333 USDC; client is refunded 667 USDC.'),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Confirm resolution' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(defaultProps.onResolve).toHaveBeenCalledTimes(1);
      expect(defaultProps.onResolve).toHaveBeenCalledWith(3333);
    });
  });

  it('shows error when onResolve rejects with an Error', async () => {
    defaultProps.onResolve.mockRejectedValueOnce(new Error('On-chain execution failed'));
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Review resolution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resolution' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('On-chain execution failed');
    });
  });

  it('shows fallback error when onResolve rejects with a non-Error and clears error on change', async () => {
    defaultProps.onResolve.mockRejectedValueOnce('Network failure');
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Review resolution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resolution' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not resolve this dispute.');
    });

    // Clicking a preset clears the error
    fireEvent.click(screen.getByRole('button', { name: '25%' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('returns focus to review button after cancelling via Change split button', async () => {
    renderForm();

    const reviewBtn = screen.getByRole('button', { name: 'Review resolution' });
    fireEvent.click(reviewBtn);

    const changeSplitBtn = screen.getByRole('button', { name: 'Change split' });
    fireEvent.click(changeSplitBtn);

    const restoredReviewBtn = screen.getByRole('button', { name: 'Review resolution' });
    expect(restoredReviewBtn).toBeInTheDocument();
    await waitFor(() => {
      expect(restoredReviewBtn).toHaveFocus();
    });
  });

  it('returns focus to review button after cancelling via Escape key', async () => {
    const { container } = renderForm();

    const reviewBtn = screen.getByRole('button', { name: 'Review resolution' });
    fireEvent.click(reviewBtn);

    expect(screen.getByText(/Confirm: freelancer receives/)).toBeInTheDocument();

    const formDiv = container.querySelector('.resolve-form')!;
    fireEvent.keyDown(formDiv, { key: 'Escape' });

    const restoredReviewBtn = screen.getByRole('button', { name: 'Review resolution' });
    expect(restoredReviewBtn).toBeInTheDocument();
    await waitFor(() => {
      expect(restoredReviewBtn).toHaveFocus();
    });
  });

  it('disables controls and indicates progress when busy is true', () => {
    renderForm({ busy: true });

    expect(screen.getByRole('button', { name: 'Review resolution' })).toBeDisabled();
  });

  it('disables confirm buttons and shows Resolving... when busy in confirm state', () => {
    const { rerender } = renderForm({ busy: false });

    fireEvent.click(screen.getByRole('button', { name: 'Review resolution' }));
    expect(screen.getByRole('button', { name: 'Confirm resolution' })).toBeEnabled();

    rerender(<ResolveDisputeForm {...defaultProps} busy={true} />);
    expect(screen.getByRole('button', { name: 'Resolving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change split' })).toBeDisabled();

    // Escape should not cancel confirmation while busy
    const formDiv = screen.getByRole('button', { name: 'Resolving...' }).closest('.resolve-form')!;
    fireEvent.keyDown(formDiv, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Resolving...' })).toBeInTheDocument();
  });
});
