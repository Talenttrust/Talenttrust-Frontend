'use client';

import { useEffect, useId, useRef } from 'react';

export interface ShortcutItem {
  keys: string[];
  description: string;
}

export interface ShortcutGroup {
  category: string;
  items: ShortcutItem[];
}

export const DEFAULT_SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Dashboard navigation',
    items: [
      { keys: ['j'], description: 'Focus next escrow card' },
      { keys: ['k'], description: 'Focus previous escrow card' },
      { keys: ['/'], description: 'Focus search input' },
      { keys: ['?'], description: 'Open keyboard shortcuts dialog' },
    ],
  },
  {
    category: 'Global & dialogs',
    items: [
      { keys: ['Ctrl / ⌘', 'K'], description: 'Open command palette' },
      { keys: ['Escape'], description: 'Clear search or close open dialog' },
    ],
  },
];

export interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
  groups?: ShortcutGroup[];
}

export function ShortcutsDialog({
  open,
  onClose,
  groups = DEFAULT_SHORTCUT_GROUPS,
}: ShortcutsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute('open');
      }
      if (returnFocusRef.current && typeof returnFocusRef.current.focus === 'function') {
        const el = returnFocusRef.current;
        returnFocusRef.current = null;
        el.focus();
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="confirm shortcuts-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="confirm-body shortcuts-body">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id={titleId} className="confirm-title">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            Close
          </button>
        </div>
        <p id={descriptionId} className="confirm-description" style={{ margin: 0 }}>
          Navigate the escrow dashboard quickly using your keyboard. Shortcuts are disabled while typing in form fields.
        </p>

        <div className="shortcuts-groups">
          {groups.map((group) => (
            <section key={group.category} className="shortcuts-group" aria-label={group.category}>
              <h3 className="shortcuts-group-title">{group.category}</h3>
              <dl className="shortcuts-list">
                {group.items.map((item) => (
                  <div key={item.description} className="shortcuts-row">
                    <dt className="shortcuts-desc">{item.description}</dt>
                    <dd className="shortcuts-keys">
                      {item.keys.map((key, idx) => (
                        <span key={key} className="shortcuts-key-wrap">
                          {idx > 0 && (
                            <span className="shortcuts-plus" aria-hidden="true">
                              +
                            </span>
                          )}
                          <kbd className="palette-kbd shortcuts-kbd">{key}</kbd>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}
