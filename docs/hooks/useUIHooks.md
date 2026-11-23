# UI & Environment Hooks (`useDisclosure`, `useHotkeys`, `useOnlineStatus`, `useTheme`)

Hooks for WAI-ARIA disclosures, keyboard shortcuts, browser connectivity state, and theme persistence.

## File Locations

- Disclosure widget hook: `src/hooks/useDisclosure.ts`
- Keyboard shortcuts hook: `src/hooks/useHotkeys.ts`
- Connectivity status hook: `src/hooks/useOnlineStatus.ts` (`src/hooks/__tests__/useOnlineStatus.test.ts`)
- Theme state hook: `src/hooks/useTheme.ts` (`src/hooks/__tests__/theme.test.tsx`)

---

## `useDisclosure` (`src/hooks/useDisclosure.ts`)

Manages open/close state and focus behavior for WAI-ARIA disclosure widgets (such as the mobile navigation drawer in `src/components/Header.tsx`).

```ts
export interface UseDisclosureReturn {
  open: boolean;
  toggle: () => void;
  close: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
}

export function useDisclosure(): UseDisclosureReturn;
```

- Closes and restores focus to `triggerRef` when `Escape` is pressed.
- Closes on `pointerdown` outside `panelRef` and `triggerRef`, or when focus moves outside the panel (`focusout`).

---

## `useHotkeys` (`src/hooks/useHotkeys.ts`)

Registers global `keydown` shortcuts mapped by `KeyboardEvent.key` (used by `EscrowDashboard` for `j`, `k`, `/`, `?`).

```ts
export type HotkeyHandler = (event: KeyboardEvent) => void;
export type HotkeyMap = Record<string, HotkeyHandler | undefined>;

export interface UseHotkeysOptions {
  enabled?: boolean;
}

export function useHotkeys(map: HotkeyMap, options?: UseHotkeysOptions): void;
```

Ignores key presses when focus is inside `<input>`, `<textarea>`, `<select>`, or `contenteditable` elements, when `Ctrl`/`Meta`/`Alt` are held, or when any `<dialog open>` is active.

---

## `useOnlineStatus` (`src/hooks/useOnlineStatus.ts`)

SSR-safe hook tracking browser network connectivity (used by `src/components/OfflineIndicator.tsx` and `src/app/offline/page.tsx`).

```ts
export function useOnlineStatus(): boolean;
```

Defaults to `true` during SSR and initial hydration, then syncs with `navigator.onLine` and `window` `online` / `offline` events.

---

## `useTheme` (`src/hooks/useTheme.ts`)

Manages light, dark, and system color-scheme preference persisted in `localStorage` under `tt.theme` (used by `src/components/ThemeToggle.tsx`).

```ts
export type Theme = 'system' | 'light' | 'dark';

export function useTheme(): [Theme, (t: Theme) => void];
```

Sets `data-theme="light"` or `data-theme="dark"` on `document.documentElement`, or removes `data-theme` when `'system'` is active.
