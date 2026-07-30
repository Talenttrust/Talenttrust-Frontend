import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  MAX_MILESTONE_TITLE_LENGTH,
  MilestoneCreationForm,
} from './MilestoneCreationForm';

describe('MilestoneCreationForm', () => {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it('matches the empty-state form structure', () => {
    const { container } = render(<MilestoneCreationForm onSubmit={onSubmit} onCancel={onCancel} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the loaded-state form structure with user-entered values', () => {
    const { container } = render(<MilestoneCreationForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: 'Frontend Sprint' },
    });
    fireEvent.change(screen.getByLabelText(/payout amount/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/currency/i), { target: { value: 'XLM' } });
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'Active' } });
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: 'Jun 1, 2025' },
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('normalizes a title before submitting the milestone', async () => {
    render(<MilestoneCreationForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: '  Design\u0000\n  review  ' },
    });
    fireEvent.change(screen.getByLabelText(/payout amount/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /add milestone/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].title).toBe('Design review');
  });

  it('rejects an over-length title instead of truncating it', async () => {
    render(<MilestoneCreationForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: 'a'.repeat(MAX_MILESTONE_TITLE_LENGTH + 1) },
    });
    fireEvent.change(screen.getByLabelText(/payout amount/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /add milestone/i }));

    await waitFor(() => {
      expect(screen.getAllByText(
        `Title must be no more than ${MAX_MILESTONE_TITLE_LENGTH} characters`,
      )[0]).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  describe('form validation', () => {
    it('shows validation messages for empty required fields on submit, and disables the button until all fields are valid', async () => {
      render(<MilestoneCreationForm onSubmit={onSubmit} onCancel={onCancel} />);

      const submitButton = screen.getByRole('button', { name: /add milestone/i });

      // Submit the empty form
      fireEvent.click(submitButton);

      // Expect validation messages
      await waitFor(() => {
        expect(screen.getByText('There is a problem')).toBeInTheDocument();
        expect(screen.getAllByText('Title is required')[0]).toBeInTheDocument();
        expect(screen.getAllByText('Payout amount is required')[0]).toBeInTheDocument();
      });

      // Submit button should be disabled while errors exist
      expect(submitButton).toBeDisabled();

      // Fix the title field — button should stay disabled because payout is still invalid
      fireEvent.change(screen.getByLabelText(/^title/i), {
        target: { value: 'Valid Title' },
      });
      expect(submitButton).toBeDisabled();

      // Fix the payout field too — now the button should be enabled
      fireEvent.change(screen.getByLabelText(/payout amount/i), {
        target: { value: '100' },
      });
      expect(submitButton).not.toBeDisabled();

      // Submit again
      fireEvent.click(submitButton);

      // All errors should be gone, and onSubmit should be called
      await waitFor(() => {
        expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
        expect(screen.queryByText('Payout amount is required')).not.toBeInTheDocument();
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
    });

    it('shows validation messages for invalid field values and clears them on fix', async () => {
      render(<MilestoneCreationForm onSubmit={onSubmit} onCancel={onCancel} />);

      // Enter invalid data
      fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'Valid Title' } });
      fireEvent.change(screen.getByLabelText(/payout amount/i), { target: { value: '-50' } }); // Invalid payout
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: 'invalid date' } }); // Invalid date
      
      fireEvent.click(screen.getByRole('button', { name: /add milestone/i }));

      await waitFor(() => {
        expect(screen.getAllByText('Payout must be a positive number')[0]).toBeInTheDocument();
        expect(screen.getAllByText('Due date must be in the format "Jun 1, 2025"')[0]).toBeInTheDocument();
      });

      // Fix the data
      fireEvent.change(screen.getByLabelText(/payout amount/i), { target: { value: '50' } });
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: 'Jun 1, 2025' } });
      
      fireEvent.click(screen.getByRole('button', { name: /add milestone/i }));

      await waitFor(() => {
        expect(screen.queryByText('Payout must be a positive number')).not.toBeInTheDocument();
        expect(screen.queryByText('Due date must be in the format "Jun 1, 2025"')).not.toBeInTheDocument();
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
    });
  });
});
