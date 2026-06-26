import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={false}
        title="Delete"
        description="Remove this item?"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dialog content and calls handlers', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete contract"
        description="Do you want to continue?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete contract')).toBeInTheDocument();
    expect(screen.getByText('Do you want to continue?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'No' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('triggers cancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Discard"
        description="Lose your changes?"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('wraps focus when tabbing past the last focusable element', async () => {
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Wrap focus"
        description="Keep focus inside the dialog"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    buttons[1].focus();
    await user.tab();

    expect(buttons[0]).toHaveFocus();
  });

  it('wraps focus backwards when shift+tab reaches the first focusable element', async () => {
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Wrap focus backwards"
        description="Keep focus inside the dialog"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    buttons[0].focus();
    await user.tab({ shift: true });

    expect(buttons[1]).toHaveFocus();
  });
});
