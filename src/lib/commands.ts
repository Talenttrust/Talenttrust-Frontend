import nav from '@/lib/nav.json';
import { site, apiDocsUrl } from '@/lib/site';
import { safeGet, safeSet } from '@/lib/safeStorage';
import { normalizeAddress, validateAddress } from '@/lib/stellar/address';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Escrows' | 'Reputation' | 'Actions' | 'Recent';
  href?: string;
  actionType?: 'copy-contract' | 'open-docs';
  shortcut?: string;
}

export const staticCommands: CommandItem[] = [
  ...nav.map((item) => ({
    id: `nav-${item.href}`,
    title: item.label,
    subtitle: item.href,
    category: 'Navigation' as const,
    href: item.href,
  })),
  {
    id: 'action-copy-contract',
    title: 'Copy contract ID',
    subtitle: site.contractId,
    category: 'Actions' as const,
    actionType: 'copy-contract' as const,
  },
  {
    id: 'action-open-docs',
    title: 'Open API documentation',
    subtitle: apiDocsUrl,
    category: 'Actions' as const,
    actionType: 'open-docs' as const,
  },
];

export function parseDynamicCommands(query: string): CommandItem[] {
  const trimmed = query.trim();
  const dynamic: CommandItem[] = [];

  // Match escrow ID (#12 or 12)
  const escrowMatch = trimmed.match(/^#?(\d+)$/);
  if (escrowMatch) {
    const id = escrowMatch[1];
    dynamic.push({
      id: `dynamic-escrow-${id}`,
      title: `Go to escrow #${id}`,
      subtitle: `/contracts/${id}`,
      category: 'Escrows',
      href: `/contracts/${id}`,
    });
  }

  // Match Stellar account address (G...), validated including checksum
  if (/^G/i.test(normalizeAddress(trimmed)) || /^[A-Z0-9]{56}$/i.test(normalizeAddress(trimmed))) {
    const validation = validateAddress(trimmed);
    if (validation.ok) {
      const address = validation.value;
      const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
      dynamic.push({
        id: `dynamic-reputation-${address}`,
        title: `Look up reputation for ${short}`,
        subtitle: address,
        category: 'Reputation',
        href: `/reputation?address=${encodeURIComponent(address)}`,
      });
    }
  }

  // The contracts dashboard searches titles, parties, tokens, and milestones.
  // Offer that same search from the command palette for any other text query.
  if (trimmed && !escrowMatch && !isStellarAddress) {
    const encoded = encodeURIComponent(trimmed);
    dynamic.push({
      id: `dynamic-escrow-search-${trimmed.toLowerCase()}`,
      title: `Search escrows for “${trimmed}”`,
      subtitle: `/contracts?q=${encoded}`,
      category: 'Escrows',
      href: `/contracts?q=${encoded}`,
    });
  }

  return dynamic;
}

export function rankCommands(query: string, commands: CommandItem[]): CommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;

  return commands
    .map((item) => {
      const title = item.title.toLowerCase();
      const subtitle = (item.subtitle || '').toLowerCase();
      const titleWords = title.split(/\s+/);

      let score = 0;
      if (title === q) {
        score = 100;
      } else if (title.startsWith(q)) {
        score = 80;
      } else if (titleWords.some((w) => w.startsWith(q))) {
        score = 60;
      } else if (subtitle.startsWith(q)) {
        score = 50;
      } else if (title.includes(q)) {
        score = 30;
      } else if (subtitle.includes(q)) {
        score = 20;
      }

      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

const RECENT_KEY = 'tt_recent_commands';
const MAX_RECENT_COMMANDS = 5;

const COMMAND_CATEGORIES: readonly CommandItem['category'][] = [
  'Navigation',
  'Escrows',
  'Reputation',
  'Actions',
  'Recent',
];

const COMMAND_ACTION_TYPES: readonly NonNullable<CommandItem['actionType']>[] = [
  'copy-contract',
  'open-docs',
];

/**
 * Validates a value read from storage before the palette renders or routes it.
 * Recent commands are plain JSON, so any shape (or a tampered payload) can
 * appear at runtime; only well-formed internal commands may pass.
 */
export function isCommandItem(value: unknown): value is CommandItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;

  if (typeof item.id !== 'string' || item.id.trim() === '') return false;
  if (typeof item.title !== 'string' || item.title.trim() === '') return false;
  if (item.subtitle !== undefined && typeof item.subtitle !== 'string') return false;
  if (!COMMAND_CATEGORIES.includes(item.category as CommandItem['category'])) return false;
  if (item.shortcut !== undefined && typeof item.shortcut !== 'string') return false;

  if (item.href !== undefined) {
    // Only same-origin app routes are allowed: reject absolute URLs,
    // protocol-relative hrefs (//example.com) and javascript: payloads.
    if (typeof item.href !== 'string') return false;
    if (!item.href.startsWith('/') || item.href.startsWith('//')) return false;
  }

  if (
    item.actionType !== undefined &&
    !COMMAND_ACTION_TYPES.includes(item.actionType as NonNullable<CommandItem['actionType']>)
  ) {
    return false;
  }

  return true;
}

export function getRecentCommands(): CommandItem[] {
  if (typeof window === 'undefined') return [];
  const raw = safeGet(RECENT_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const valid: CommandItem[] = [];
    for (const entry of parsed) {
      if (!isCommandItem(entry)) continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      valid.push(entry);
      if (valid.length === MAX_RECENT_COMMANDS) break;
    }
    return valid;
  } catch {
    return [];
  }
}

export function saveRecentCommand(command: CommandItem): void {
  if (typeof window === 'undefined') return;
  const existing = getRecentCommands();
  const filtered = existing.filter((c) => c.id !== command.id);
  const updated = [
    {
      id: command.id,
      title: command.title,
      subtitle: command.subtitle,
      category: 'Recent' as const,
      href: command.href,
      actionType: command.actionType,
    },
    ...filtered,
  ].slice(0, 5);
  safeSet(RECENT_KEY, JSON.stringify(updated));
}
