import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ActionPanel from '../ActionPanel';

describe('ActionPanel', () => {
  it('renders Active actions when status is Active', () => {
    const onSubmitMilestone = jest.fn();
    const onReleaseFunds = jest.fn();
    const onDispute = jest.fn();

    render(
      <ActionPanel
        status="Active"
        onSubmitMilestone={onSubmitMilestone}
        onReleaseFunds={onReleaseFunds}
        onDispute={onDispute}
      />
    );

    expect(screen.getByRole('button', { name: /Submit milestone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Release funds/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dispute/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Submit milestone/i }));
    expect(onSubmitMilestone).toHaveBeenCalledTimes(1);

    // Release Funds opens a confirmation dialog — confirm it
    fireEvent.click(screen.getByRole('button', { name: /Release funds/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Release Funds/i }));
    expect(onReleaseFunds).toHaveBeenCalledTimes(1);

    // Dispute opens a confirmation dialog — confirm it
    fireEvent.click(screen.getByRole('button', { name: /Dispute/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Dispute/i }));
    expect(onDispute).toHaveBeenCalledTimes(1);
  });

  it('keeps actions in a logical keyboard tab order with visible focus rings', () => {
    render(
      <ActionPanel
        status="Active"
        onSubmitMilestone={jest.fn()}
        onReleaseFunds={jest.fn()}
        onDispute={jest.fn()}
      />
    );

    const panel = screen.getByRole('complementary', { name: /what would you like to do/i });
    const buttons = within(panel).getAllByRole('button');

    expect(buttons.map((button) => button.textContent)).toEqual([
      'Submit Milestone',
      'Release Funds',
      'Dispute',
    ]);

    buttons.forEach((button) => {
      expect(button).not.toHaveAttribute('tabindex', '-1');
      expect(button).toHaveClass('focus-visible:outline');
      expect(button).toHaveClass('focus-visible:outline-4');
      expect(button).toHaveClass('focus-visible:outline-offset-2');
      button.focus();
      expect(button).toHaveFocus();
    });
  });

  it('renders unavailable actions as disabled controls with accessible reasons', () => {
    const onDispute = jest.fn();

    render(
      <ActionPanel
        status="Pending"
        onDispute={onDispute}
        disabledReasons={{
          releaseFunds: 'Connect a wallet with client permissions to release funds.',
        }}
      />
    );

    const releaseFunds = screen.getByRole('button', { name: /release funds to the contractor/i });
    const dispute = screen.getByRole('button', { name: /open a dispute/i });

    expect(releaseFunds).toBeDisabled();
    expect(releaseFunds).toHaveAccessibleDescription(
      'Connect a wallet with client permissions to release funds.'
    );

    fireEvent.click(releaseFunds);

    // Dispute button opens a confirmation dialog — confirm it
    fireEvent.click(dispute);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Dispute/i }));

    expect(onDispute).toHaveBeenCalledTimes(1);
  });

  it('disables visible actions while loading contract data', () => {
    const onSubmitMilestone = jest.fn();

    render(<ActionPanel status="Active" onSubmitMilestone={onSubmitMilestone} isLoading />);

    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription('Action is disabled while contract data is loading.');
    });

    fireEvent.click(screen.getByRole('button', { name: /submit milestone for approval/i }));
    expect(onSubmitMilestone).not.toHaveBeenCalled();
  });

  it('announces action panel errors without changing keyboard order', () => {
    render(
      <ActionPanel
        status="Disputed"
        onDispute={jest.fn()}
        errorMessage="Network is slow. Try again in a moment."
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Network is slow. Try again in a moment.');
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Dispute']);
  });

  it('renders View Summary action for Completed status', () => {
    const onViewSummary = jest.fn();
    render(<ActionPanel status="Completed" onViewSummary={onViewSummary} />);

    expect(screen.getByRole('button', { name: /View contract summary details/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View contract summary details/i }));
    expect(onViewSummary).toHaveBeenCalledTimes(1);
  });
});
