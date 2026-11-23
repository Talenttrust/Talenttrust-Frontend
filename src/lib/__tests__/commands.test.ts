import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommandItem,
  rankCommands,
  parseDynamicCommands,
  getRecentCommands,
  saveRecentCommand,
  isCommandItem,
} from '@/lib/commands';

// Known-valid Stellar account address (checksum verified by validateAddress).
const VALID_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

describe('commands library', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('parseDynamicCommands', () => {
    it('parses numeric query as escrow lookup', () => {
      const parsed = parseDynamicCommands('42');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Go to escrow #42');
      expect(parsed[0].href).toBe('/contracts/42');
    });

    it('parses hash numeric query as escrow lookup', () => {
      const parsed = parseDynamicCommands('#101');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Go to escrow #101');
      expect(parsed[0].href).toBe('/contracts/101');
    });

    it('offers reputation lookup for a valid Stellar account address', () => {
      const parsed = parseDynamicCommands(VALID_ADDRESS);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toContain('Look up reputation for');
      expect(parsed[0].href).toBe(`/reputation?address=${encodeURIComponent(VALID_ADDRESS)}`);
    });

    it('does not offer reputation lookup for a wrong-checksum 56-char address', () => {
      // Same as VALID_ADDRESS with the last character changed: correct shape, bad checksum.
      const bad = VALID_ADDRESS.slice(0, 55) + (VALID_ADDRESS.endsWith('N') ? 'M' : 'N');
      expect(bad).toHaveLength(56);
      expect(parseDynamicCommands(bad)).toEqual([]);
    });

    it('does not offer reputation lookup for invalid base32 characters', () => {
      const bad = 'G' + '1'.repeat(55);
      expect(parseDynamicCommands(bad)).toEqual([]);
    });

    it('accepts lowercase input and uses the normalized address in href', () => {
      const parsed = parseDynamicCommands(VALID_ADDRESS.toLowerCase());
      expect(parsed).toHaveLength(1);
      expect(parsed[0].href).toBe(`/reputation?address=${encodeURIComponent(VALID_ADDRESS)}`);
    });

    it('accepts valid addresses padded with whitespace and zero-width characters', () => {
      const padded = `  \u200b${VALID_ADDRESS}\u200d \ufeff `;
      const parsed = parseDynamicCommands(padded);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].href).toBe(`/reputation?address=${encodeURIComponent(VALID_ADDRESS)}`);
    });

    it('creates an escrow search command for a title query', () => {
      const parsed = parseDynamicCommands('website redesign');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Search escrows for “website redesign”');
      expect(parsed[0].href).toBe('/contracts?q=website%20redesign');
      expect(parsed[0].category).toBe('Escrows');
    });

    it('creates an escrow search command for a party address query', () => {
      const parsed = parseDynamicCommands('GABC123');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Search escrows for “GABC123”');
      expect(parsed[0].href).toBe('/contracts?q=GABC123');
      expect(parsed[0].category).toBe('Escrows');
    });
  });

  describe('rankCommands', () => {
    const testCommands: CommandItem[] = [
      { id: '1', title: 'Home', subtitle: '/', category: 'Navigation' },
      { id: '2', title: 'Escrows Dashboard', subtitle: '/contracts', category: 'Navigation' },
      { id: '3', title: 'Reputation Lookup', subtitle: '/reputation', category: 'Navigation' },
      { id: '4', title: 'Documentation', subtitle: '/docs', category: 'Navigation' },
    ];

    it('returns all items when query is empty', () => {
      const ranked = rankCommands('', testCommands);
      expect(ranked).toHaveLength(4);
    });

    it('ranks exact and prefix matches higher than substrings', () => {
      const ranked = rankCommands('rep', testCommands);
      expect(ranked[0].id).toBe('3'); // Reputation Lookup
    });

    it('ranks word-start matches appropriately', () => {
      const ranked = rankCommands('dash', testCommands);
      expect(ranked[0].id).toBe('2'); // Escrows Dashboard
    });

    it('filters out non-matching commands', () => {
      const ranked = rankCommands('xyz123', testCommands);
      expect(ranked).toHaveLength(0);
    });
  });

  describe('recent commands persistence', () => {
    const cmd1: CommandItem = { id: 'c1', title: 'Cmd 1', category: 'Navigation', href: '/1' };
    const cmd2: CommandItem = { id: 'c2', title: 'Cmd 2', category: 'Navigation', href: '/2' };

    it('persists and retrieves recent commands', () => {
      saveRecentCommand(cmd1);
      saveRecentCommand(cmd2);

      const recent = getRecentCommands();
      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('c2'); // Most recent first
      expect(recent[1].id).toBe('c1');
    });

    it('safely handles corrupted localStorage data', () => {
      localStorage.setItem('tt_recent_commands', 'invalid-json{{');
      expect(getRecentCommands()).toEqual([]);
    });
  });

  describe('recent command validation', () => {
    const store = (items: unknown) =>
      localStorage.setItem('tt_recent_commands', JSON.stringify(items));

    const validCommand: CommandItem = {
      id: 'nav-/contracts',
      title: 'Escrows',
      subtitle: '/contracts',
      category: 'Navigation',
      href: '/contracts',
    };

    it('returns an empty list when the stored JSON is not an array', () => {
      store({ id: 'nav-/', title: 'Home', category: 'Navigation', href: '/' });
      expect(getRecentCommands()).toEqual([]);

      store('not-an-array');
      expect(getRecentCommands()).toEqual([]);

      store(null);
      expect(getRecentCommands()).toEqual([]);
    });

    it('drops entries with missing or wrong-shaped fields', () => {
      store([
        validCommand,
        null,
        'nav-/',
        42,
        { title: 'No id', category: 'Navigation', href: '/' },
        { id: 7, title: 'Numeric id', category: 'Navigation', href: '/' },
        { id: 'a', category: 'Navigation', href: '/' },
        { id: 'b', title: 42, category: 'Navigation', href: '/' },
        { id: 'c', title: 'Bad subtitle', subtitle: 9, category: 'Navigation', href: '/' },
        { id: 'd', title: 'Unknown category', category: 'Admin', href: '/' },
        { id: 'e', title: 'Missing category', href: '/' },
      ]);

      expect(getRecentCommands()).toEqual([validCommand]);
    });

    it('drops external, protocol-relative and non-slash hrefs', () => {
      store([
        validCommand,
        { id: 'external', title: 'External', category: 'Navigation', href: 'https://evil.example' },
        { id: 'js', title: 'Script', category: 'Navigation', href: 'javascript:alert(1)' },
        { id: 'protocol-relative', title: 'Sneaky', category: 'Navigation', href: '//evil.example' },
        { id: 'relative', title: 'Relative', category: 'Navigation', href: 'contracts' },
        { id: 'numeric-href', title: 'Numeric href', category: 'Navigation', href: 12 },
      ]);

      expect(getRecentCommands()).toEqual([validCommand]);
    });

    it('drops unknown action types and keeps allowed ones', () => {
      store([
        { id: 'copy', title: 'Copy contract ID', category: 'Actions', actionType: 'copy-contract' },
        { id: 'docs', title: 'Open docs', category: 'Actions', actionType: 'open-docs' },
        { id: 'unknown', title: 'Unknown action', category: 'Actions', actionType: 'delete-everything' },
        { id: 'numeric', title: 'Numeric action', category: 'Actions', actionType: 1 },
      ]);

      expect(getRecentCommands().map((item) => item.id)).toEqual(['copy', 'docs']);
    });

    it('removes duplicate ids, keeping the first occurrence', () => {
      store([
        { ...validCommand, title: 'First' },
        { ...validCommand, title: 'Second' },
        { id: 'other', title: 'Other', category: 'Navigation', href: '/docs' },
      ]);

      const recent = getRecentCommands();
      expect(recent).toHaveLength(2);
      expect(recent.map((item) => item.title)).toEqual(['First', 'Other']);
    });

    it('caps validated results at five entries', () => {
      store(
        Array.from({ length: 7 }, (_, index) => ({
          id: `cmd-${index}`,
          title: `Command ${index}`,
          category: 'Navigation',
          href: `/route-${index}`,
        })),
      );

      const recent = getRecentCommands();
      expect(recent).toHaveLength(5);
      expect(recent[0].id).toBe('cmd-0');
      expect(recent[4].id).toBe('cmd-4');
    });

    it('isCommandItem accepts well-formed entries and rejects bad ones', () => {
      expect(isCommandItem(validCommand)).toBe(true);
      expect(
        isCommandItem({ id: 'action', title: 'Copy', category: 'Recent', actionType: 'copy-contract' }),
      ).toBe(true);
      expect(isCommandItem(null)).toBe(false);
      expect(isCommandItem('command')).toBe(false);
      expect(isCommandItem([])).toBe(false);
      expect(isCommandItem({ ...validCommand, category: 'Recent' })).toBe(true);
      expect(isCommandItem({ ...validCommand, id: '' })).toBe(false);
      expect(isCommandItem({ ...validCommand, title: '  ' })).toBe(false);
      expect(isCommandItem({ ...validCommand, href: undefined })).toBe(true);
    });
  });
});
