import { describe, expect, it } from 'vitest';
import { MAX_MILESTONES } from '@/components/MilestoneBuilder';
import { parseMilestoneCsv } from '@/lib/milestoneImport';

describe('parseMilestoneCsv', () => {
  it('parses quoted fields and returns milestones in order', () => {
    const result = parseMilestoneCsv('title,amount\r\nDesign,300\r\n"Build, phase 2",700\r\n');

    expect(result.errors).toEqual([]);
    expect(result.rows.map(({ title, amount }) => ({ title, amount }))).toEqual([
      { title: 'Design', amount: '300' },
      { title: 'Build, phase 2', amount: '700' },
    ]);
  });

  it('handles a BOM, LF endings and escaped quotes', () => {
    const result = parseMilestoneCsv('\ufefftitle,amount\n"Say ""hi""",1.5\n');

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ title: 'Say "hi"', amount: '1.5' });
  });

  it('accepts headers in any order and in any case', () => {
    const result = parseMilestoneCsv('Amount,Title\n300,Design\n');

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ title: 'Design', amount: '300' });
  });

  it('rejects a missing header column at line 1', () => {
    const result = parseMilestoneCsv('title\r\nDesign\r\n');

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      {
        line: 1,
        message: 'The CSV header must include amount. Expected columns: title,amount.',
      },
    ]);
  });

  it('rejects an empty CSV', () => {
    expect(parseMilestoneCsv('')).toEqual({
      rows: [],
      errors: [{ line: 1, message: 'The CSV is empty. Add a header row with title and amount.' }],
    });
  });

  it('rejects a header with no data rows', () => {
    expect(parseMilestoneCsv('title,amount\n')).toEqual({
      rows: [],
      errors: [{ line: 2, message: 'Add at least one milestone.' }],
    });
  });

  it('reports missing titles and amounts with exact line numbers', () => {
    const result = parseMilestoneCsv('title,amount\n,10\nDesign,\n');

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { line: 2, message: 'Enter a milestone title.' },
      { line: 3, message: 'Enter an amount.' },
    ]);
  });

  it('rejects invalid amounts and too many decimals', () => {
    const result = parseMilestoneCsv('title,amount\nA,abc\nB,1.12345678\nC,0\n');

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { line: 2, message: 'Enter a number, for example 300 or 12.5.' },
      { line: 3, message: 'Use at most 7 decimal places.' },
      { line: 4, message: 'The amount must be greater than 0.' },
    ]);
  });

  it('rejects formula-injection titles', () => {
    const result = parseMilestoneCsv('title,amount\n=1+1,10\n');

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      {
        line: 2,
        message: 'Titles cannot start with =, +, -, @, a tab, or a carriage return.',
      },
    ]);
  });

  it('rejects more than 20 milestones at the first excess line', () => {
    const body = Array.from({ length: MAX_MILESTONES + 1 }, (_, i) => `M${i},1`).join('\n');
    const result = parseMilestoneCsv(`title,amount\n${body}\n`);

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      {
        line: MAX_MILESTONES + 2,
        message: `An escrow can have at most ${MAX_MILESTONES} milestones.`,
      },
    ]);
  });

  it('rejects rows with more columns than the header', () => {
    const result = parseMilestoneCsv('title,amount\nDesign,300,extra\n');

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ line: 2, message: 'Expected 2 columns but found 3.' }]);
  });

  it('rejects malformed quoting', () => {
    const result = parseMilestoneCsv('title,amount\n"Design,300\n');

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ line: 2, message: 'Unclosed quoted field.' }]);
  });

  it('does not partially import when one row is invalid', () => {
    const result = parseMilestoneCsv('title,amount\nDesign,300\n,700\n');

    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});
