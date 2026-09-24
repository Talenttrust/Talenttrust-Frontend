/**
 * Route-level access decisions for protected contract routes.
 *
 * A protected route has to answer two different questions that are easy to
 * conflate, and conflating them leaks information:
 *
 *   1. **Does this resource exist?** — a well-formed id nobody owns.
 *   2. **May this identity read it?** — the resource exists, but the current
 *      wallet is not on the permitted list.
 *
 * If an inaccessible resource is reported as "not found", the route tells every
 * caller whether a given id exists, which is exactly the private data the route
 * is supposed to protect. So the two are separate outcomes here, and only the
 * first is rendered as "not found".
 *
 * The module is deliberately pure: no React, no storage, no network. The
 * decision is a value, so it can be unit-tested exhaustively and the caller
 * cannot accidentally make the decision based on timing.
 *
 * ## Undecided is not the same as denied
 *
 * `walletResolved` exists because the wallet session is rehydrated from storage
 * in an effect, so there is a real window where `walletAddress` is `null` while
 * a wallet *is* persisted. Deciding during that window would flash a denial at
 * a user who is in fact authorized — and, worse, would render the denial for an
 * authorization failure that has not happened. While the identity is still being
 * established the outcome is `'loading'`, and the caller renders a neutral
 * skeleton rather than a verdict.
 */

/**
 * The four states a protected route can be in.
 *
 * - `'loading'` — the wallet identity is not yet known, so no verdict is safe.
 * - `'not-found'` — the id is well-formed but no such resource exists.
 * - `'unauthorized'` — the resource exists (or may exist) but this identity is
 *   not permitted to read it. Never rendered with the resource's contents.
 * - `'granted'` — the identity may read the resource.
 */
export type ContractAccessKind =
  | 'loading'
  | 'not-found'
  | 'unauthorized'
  | 'granted';

/** Inputs to a route access decision. */
export interface ContractAccessInput {
  /**
   * The connected Stellar public key, or `null` when no wallet is connected.
   */
  walletAddress: string | null;

  /**
   * `false` while the wallet session is still being rehydrated from storage.
   *
   * Defaults to `true` at the call site when the caller has no hydration
   * concept, so a missing flag never blocks a decision forever.
   */
  walletResolved: boolean;

  /**
   * Whether the resource exists. This must come from a real lookup — a resolver
   * that invents data for any id cannot answer it.
   */
  resourceExists: boolean;

  /**
   * Addresses permitted to read the resource.
   *
   * An empty list, `null`, or `undefined` means the resource is public, and a
   * public resource is `'granted'` even with no wallet connected. This is the
   * default for resources that predate the permission model, so introducing
   * authorization does not retroactively lock existing records.
   */
  permittedAddresses?: readonly string[] | null;
}

/**
 * Normalises an address for comparison.
 *
 * Stellar public keys are upper-case `G…` strings, but wallet extensions and
 * hand-written fixtures disagree about case, and one of the existing test
 * fixtures is not a Stellar address at all (`0x123`). Comparison is therefore
 * case-insensitive on trimmed values rather than validating the shape: shape
 * validation belongs to the wallet layer, and rejecting an odd-but-permitted
 * address here would deny access to a resource that explicitly lists it.
 *
 * @param address - The raw address to normalise.
 * @returns The trimmed, lower-cased address, or an empty string when absent.
 */
export function normaliseAddress(address: string | null | undefined): string {
  return typeof address === 'string' ? address.trim().toLowerCase() : '';
}

/**
 * Decides whether the permitted list imposes any restriction at all.
 *
 * @param permittedAddresses - The permitted list, if any.
 * @returns `true` when the list is absent or contains no usable entry.
 */
export function isPublicResource(
  permittedAddresses?: readonly string[] | null,
): boolean {
  if (!Array.isArray(permittedAddresses)) {
    return true;
  }
  return permittedAddresses.every(
    (address) => normaliseAddress(address) === '',
  );
}

/**
 * Decides the access state for a protected contract route.
 *
 * Evaluation order is significant and is the whole point of the function:
 *
 * 1. An unresolved identity yields `'loading'` **before** existence is
 *    consulted, so a slow wallet never produces a not-found verdict.
 * 2. A missing resource yields `'not-found'` before authorization, because
 *    "nothing is there" and "you may not see what is there" are different
 *    answers and must not be merged.
 * 3. A public resource is `'granted'` regardless of identity.
 * 4. Otherwise the identity must appear on the permitted list.
 *
 * @param input - The route, identity and resource facts.
 * @returns The access kind for the route.
 *
 * @example
 * ```ts
 * decideContractAccess({
 *   walletAddress: 'GA…',
 *   walletResolved: true,
 *   resourceExists: true,
 *   permittedAddresses: ['ga…'],
 * }); // 'granted'
 * ```
 */
export function decideContractAccess(
  input: ContractAccessInput,
): ContractAccessKind {
  const {
    walletAddress,
    walletResolved,
    resourceExists,
    permittedAddresses,
  } = input;

  // 1. Identity still being established — no verdict is safe yet.
  if (!walletResolved) {
    return 'loading';
  }

  // 2. The resource does not exist. Checked before authorization so an
  //    inaccessible resource is never reported as missing.
  if (!resourceExists) {
    return 'not-found';
  }

  // 3. No restriction on the resource.
  if (isPublicResource(permittedAddresses)) {
    return 'granted';
  }

  // 4. A restriction exists, so an identity is required to satisfy it.
  const candidate = normaliseAddress(walletAddress);
  if (candidate === '') {
    return 'unauthorized';
  }

  const permitted = (permittedAddresses ?? []).some(
    (address) => normaliseAddress(address) === candidate,
  );

  return permitted ? 'granted' : 'unauthorized';
}

/** A recovery link offered alongside a non-granted route state. */
export interface AccessRecoveryLink {
  href: string;
  label: string;
  description: string;
}

/**
 * Copy for a non-granted route state.
 *
 * `unauthorized` is worded so it does not confirm or deny that the id exists:
 * it says the identity lacks access, and never that the contract is missing.
 */
export interface AccessCopy {
  title: string;
  message: string;
}

/**
 * Returns the user-facing copy for an access state.
 *
 * @param kind - The access state to describe.
 * @returns The heading and body copy for that state.
 */
export function describeAccess(kind: ContractAccessKind): AccessCopy {
  switch (kind) {
    case 'loading':
      return {
        title: 'Checking access',
        message:
          'Verifying your wallet session before loading this contract.',
      };
    case 'not-found':
      return {
        title: 'Contract not found',
        message:
          'No contract matches this link. It may have been removed, or the link may be mistyped.',
      };
    case 'unauthorized':
      return {
        title: 'You do not have access to this contract',
        message:
          'This contract is restricted to the wallets named on it. Connect the wallet that is part of this contract to view it.',
      };
    case 'granted':
      return {
        title: 'Contract',
        message: 'Access granted.',
      };
  }
}

/**
 * Recovery links for a non-granted route state.
 *
 * Every non-granted state offers a way forward — a dead end with no next step
 * is what makes a protected route feel broken rather than protected.
 *
 * @param kind - The access state to offer recovery for.
 * @returns Ordered recovery links; empty for `'granted'`.
 */
export function accessRecoveryLinks(
  kind: ContractAccessKind,
): AccessRecoveryLink[] {
  const contracts = {
    href: '/contracts',
    label: 'Back to contracts',
    description: 'Return to the list you can access',
  };

  switch (kind) {
    case 'unauthorized':
      return [
        {
          href: '/wallet',
          label: 'Manage wallet',
          description: 'Switch to a wallet named on this contract',
        },
        contracts,
      ];
    case 'not-found':
      return [
        contracts,
        {
          href: '/milestones',
          label: 'Track milestones',
          description: 'See the checkpoints you work against',
        },
      ];
    case 'loading':
      return [];
    case 'granted':
      return [];
  }
}

/**
 * Whether a mutation may be attempted for an access state.
 *
 * Reads and writes are deliberately different questions. A public contract is
 * readable by anyone, but changing it still requires an identified wallet —
 * which is how the route already behaves, and separating the two here keeps
 * that rule in one place instead of spread across each call site.
 *
 * @param kind - The route's access state.
 * @param walletAddress - The connected wallet address, if any.
 * @returns `true` when a mutation is permitted.
 */
export function canMutate(
  kind: ContractAccessKind,
  walletAddress: string | null,
): boolean {
  if (kind === 'loading' || kind === 'not-found' || kind === 'unauthorized') {
    return false;
  }
  return normaliseAddress(walletAddress) !== '';
}
