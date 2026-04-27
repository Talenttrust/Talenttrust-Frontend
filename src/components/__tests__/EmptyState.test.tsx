import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="Test Title"
        description="Test Description"
      />
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Description')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const icon = <span data-testid="test-icon">Icon</span>;
    render(
      <EmptyState
        icon={icon}
        title="Test Title"
        description="Test Description"
      />
    );

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('does not render icon when not provided', () => {
    render(
      <EmptyState
        title="Test Title"
        description="Test Description"
      />
    );

    expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument();
  });

  it('renders action button when actionLabel and onAction are provided', () => {
    const mockOnAction = jest.fn();
    render(
      <EmptyState
        title="Test Title"
        description="Test Description"
        actionLabel="Test Action"
        onAction={mockOnAction}
      />
    );

    const button = screen.getByRole('button', { name: 'Test Action' });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(mockOnAction).toHaveBeenCalledTimes(1);
  });

  it('does not render action button when actionLabel or onAction is missing', () => {
    render(
      <EmptyState
        title="Test Title"
        description="Test Description"
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    render(
      <EmptyState
        title="Test Title"
        description="Test Description"
      />
    );

    const region = screen.getByRole('region');
    expect(region).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toHaveAttribute('id', 'empty-state-title');
  });
});