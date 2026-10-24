import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FundControl from './FundControl';
import type { Contract } from './fundControl';

const contract: Contract = {
  totalAmount: 1000,
  fundedAmount: 300,
  releasedAmount: 0,
  milestones: [
    { id: 1, amount: 300, released: false },
    { id: 2, amount: 400, released: false },
    { id: 3, amount: 300, released: false },
  ],
};

describe('FundControl', () => {
  it('renders funding bar and presets', () => {
    render(<FundControl contract={contract} onDeposit={async () => {}} />);
    expect(screen.getByRole('progressbar', { name: /funding progress/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remaining/ })).toBeInTheDocument();
  });

  it('shows Next milestone preset when not yet covered', () => {
    render(<FundControl contract={contract} onDeposit={async () => {}} />);
    expect(screen.queryByRole('button', { name: /Next milestone/ })).toBeInTheDocument();
  });

  it('hides Next milestone preset when already covered', () => {
    render(
      <FundControl
        contract={{ ...contract, fundedAmount: 700 }}
        onDeposit={async () => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Next milestone/ })).not.toBeInTheDocument();
  });

  it('submits a valid deposit and calls onSuccess', async () => {
    const onDeposit = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    render(<FundControl contract={contract} onDeposit={onDeposit} onSuccess={onSuccess} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/Deposit amount/i);
    await user.type(input, '150');
    await user.click(screen.getByRole('button', { name: /^Deposit$/i }));
    await waitFor(() => expect(onDeposit).toHaveBeenCalledWith(150));
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows inline error on over_funded API 409', async () => {
    const onDeposit = vi.fn().mockRejectedValue(new Error('409 over_funded'));
    render(<FundControl contract={contract} onDeposit={onDeposit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Deposit amount/i), '100');
    await user.click(screen.getByRole('button', { name: /^Deposit$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/exceeds the remaining balance/i);
  });

  it('shows inline error on invalid_status', async () => {
    const onDeposit = vi.fn().mockRejectedValue(new Error('409 invalid_status'));
    render(<FundControl contract={contract} onDeposit={onDeposit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Deposit amount/i), '100');
    await user.click(screen.getByRole('button', { name: /^Deposit$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot accept deposits/i);
  });

  it('shows inline error on network failure', async () => {
    const onDeposit = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    render(<FundControl contract={contract} onDeposit={onDeposit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Deposit amount/i), '100');
    await user.click(screen.getByRole('button', { name: /^Deposit$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('shows inline error on invalid input', async () => {
    const onDeposit = vi.fn();
    render(<FundControl contract={contract} onDeposit={onDeposit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Deposit amount/i), '0');
    await user.click(screen.getByRole('button', { name: /^Deposit$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/greater than zero/i);
    expect(onDeposit).not.toHaveBeenCalled();
  });

  it('marks input invalid and links error via aria-describedby', async () => {
    render(<FundControl contract={contract} onDeposit={async () => {}} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/Deposit amount/i);
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: /^Deposit$/i }));
    const alert = await screen.findByRole('alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('applies Next milestone preset', async () => {
    render(<FundControl contract={contract} onDeposit={async () => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Next milestone/ }));
    const input = screen.getByLabelText(/Deposit amount/i) as HTMLInputElement;
    expect(input.value).toBe('100');
  });

  it('applies Remaining preset', async () => {
    render(<FundControl contract={contract} onDeposit={async () => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Remaining/ }));
    const input = screen.getByLabelText(/Deposit amount/i) as HTMLInputElement;
    expect(input.value).toBe('700');
  });

  it('clears input on Escape', async () => {
    render(<FundControl contract={contract} onDeposit={async () => {}} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/Deposit amount/i) as HTMLInputElement;
    await user.type(input, '150');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('');
  });
});
