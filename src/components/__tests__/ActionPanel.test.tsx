import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: /Release funds/i }));
    fireEvent.click(screen.getByRole('button', { name: /Dispute/i }));

    expect(onSubmitMilestone).toHaveBeenCalledTimes(1);
    expect(onReleaseFunds).toHaveBeenCalledTimes(1);
    expect(onDispute).toHaveBeenCalledTimes(1);
  });

  it('renders View Summary action for Completed status', () => {
    const onViewSummary = jest.fn();
    render(<ActionPanel status="Completed" onViewSummary={onViewSummary} />);

    expect(screen.getByRole('button', { name: /View Summary/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View Summary/i }));
    expect(onViewSummary).toHaveBeenCalledTimes(1);
  });
});
