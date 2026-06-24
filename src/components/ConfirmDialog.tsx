'use client';

import React, { useEffect, useRef } from 'react';

/** Props for the ConfirmDialog component */
export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Dialog title */
  title: string;
  /** Dialog description or message */
  description: string;
  /** Text for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Text for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** Callback when the user confirms the action */
  onConfirm: () => void;
  /** Callback when the user cancels or closes the dialog */
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog.
 *
 * - Focus is moved to the cancel button when opened.
 * - Focus is trapped within the dialog.
 * - Escape key triggers cancel.
 * - After closing, focus returns to the element that opened the dialog (handled by the caller).
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const FOCUSABLE_SELECTORS =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  useEffect(() => {
    if (!isOpen) return;
    // Move focus to cancel button on open
    cancelBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        const panel = dialogRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-md bg-white rounded-lg shadow-xl p-6 border border-gray-200"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold mb-4">
          {title}
        </h2>
        <p className="text-sm text-gray-700 mb-6">{description}</p>
        <div className="flex justify-end space-x-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
