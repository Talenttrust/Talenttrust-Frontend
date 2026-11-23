import { describe, expect, it } from 'vitest';
import { Cell, isFormulaInjection, parseCsv, sanitizeCell, toCsv } from '@/lib/csv';

describe('sanitizeCell', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+cmd', "'+cmd"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tx', "'\tx"],
    ['\rx', "'\rx"],
    ['plain', 'plain'],
    ['a=b', 'a=b'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeCell(input)).toBe(expected);
  });
});

describe('toCsv', () => {
  const one = (cell: Cell) => toCsv(['h'], [[cell]]).slice('h\r\n'.length);

  it('joins records with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, 'y']])).toBe('a,b\r\n1,x\r\n2,y');
  });

  it.each([
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['cr\r\nhere', '"cr\r\nhere"'],
    ['Логотип café 🚀', 'Логотип café 🚀'],
    ['=1+1, "quoted"', `"'=1+1, ""quoted"""`],
    ['@x', "'@x"],
    ['\rx', `"'\rx"`],
  ])('quotes and sanitises string %j', (input, expected) => {
    expect(one(input)).toBe(expected);
  });

  it('keeps numbers numeric, negatives included', () => {
    expect(toCsv(['n'], [[-5], [0], [12.5]])).toBe('n\r\n-5\r\n0\r\n12.5');
  });

  it('writes empty cells for null, undefined and non-finite numbers', () => {
    expect(toCsv(['a', 'b', 'c', 'd'], [[null, undefined, NaN, Infinity]])).toBe('a,b,c,d\r\n,,,');
  });

  it('writes booleans as true/false', () => {
    expect(toCsv(['b'], [[true], [false]])).toBe('b\r\ntrue\r\nfalse');
  });

  it('escapes headers too', () => {
    expect(toCsv(['a,b', '=x'], [])).toBe(`"a,b",'=x`);
  });

  it('exports =HYPERLINK as literal text', () => {
    expect(one('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('parseCsv', () => {
  it('parses quoted fields, escaped quotes and commas', () => {
    const { rows, errors } = parseCsv('title,amount\r\n"Design, v2","1,000"\r\n"Say ""hi""",300');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 1, cells: ['title', 'amount'] },
      { line: 2, cells: ['Design, v2', '1,000'] },
      { line: 3, cells: ['Say "hi"', '300'] },
    ]);
  });

  it('handles a UTF-8 BOM, CRLF and LF endings', () => {
    const { rows } = parseCsv('\ufeffa,b\r\n1,2\n3,4\r\n');

    expect(rows.map((row) => row.cells)).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(rows.map((row) => row.line)).toEqual([1, 2, 3]);
  });

  it('keeps empty and trailing fields', () => {
    const { rows } = parseCsv('a,b,c\r\n1,,3\r\n,,\r\n4,5,');

    expect(rows.map((row) => row.cells)).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
      ['', '', ''],
      ['4', '5', ''],
    ]);
  });

  it('skips blank lines', () => {
    const { rows } = parseCsv('a\n\nb\n');
    expect(rows.map((row) => row.cells)).toEqual([['a'], ['b']]);
  });

  it('tracks line numbers across newlines inside quoted fields', () => {
    const { rows } = parseCsv('title,amount\n"multi\nline",5\nnext,6');

    expect(rows[1]).toEqual({ line: 2, cells: ['multi\nline', '5'] });
    expect(rows[2]).toEqual({ line: 4, cells: ['next', '6'] });
  });

  it('reports an unclosed quoted field with its starting line', () => {
    const { errors } = parseCsv('a,b\n"unclosed,2\n');
    expect(errors).toEqual([{ line: 2, message: 'Unclosed quoted field.' }]);
  });

  it('reports unexpected characters after a closing quote', () => {
    const { errors } = parseCsv('a\n"x"y');
    expect(errors[0]).toMatchObject({ line: 2, message: 'Unexpected character after closing quote.' });
  });

  it('reports a quote inside an unquoted field', () => {
    const { errors } = parseCsv('a\nx"y');
    expect(errors[0]).toMatchObject({ line: 2, message: 'Unexpected quote in an unquoted field.' });
  });

  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual({ rows: [], errors: [] });
    expect(parseCsv('\ufeff')).toEqual({ rows: [], errors: [] });
  });
});

describe('isFormulaInjection', () => {
  it.each(['=1+1', '+cmd', '-2', '@SUM(A1)', '\tx', '\rx'])('flags %j', (value) => {
    expect(isFormulaInjection(value)).toBe(true);
  });

  it.each(['plain', 'a=b', '', "'=1+1"])('allows %j', (value) => {
    expect(isFormulaInjection(value)).toBe(false);
  });
});
