export type Cell = string | number | boolean | null | undefined;

// Spreadsheets run cells starting with these as formulas
const FORMULA_START = /^[=+\-@\t\r]/;

export function sanitizeCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** True when a cell would be interpreted as a spreadsheet formula. */
export function isFormulaInjection(value: string): boolean {
  return FORMULA_START.test(value);
}

export interface CsvError {
  line: number;
  message: string;
}

export interface CsvRow {
  /** 1-based line where the record starts in the source text. */
  line: number;
  cells: string[];
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: CsvError[];
}

/**
 * RFC 4180-style parser for imported CSV.
 *
 * Handles quoted fields, escaped quotes, commas and newlines inside quoted
 * fields, CRLF/LF endings, a UTF-8 BOM, empty fields and trailing fields.
 * Malformed quoting is reported with the source line instead of throwing.
 */
export function parseCsv(text: string): CsvParseResult {
  const rows: CsvRow[] = [];
  const errors: CsvError[] = [];
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoteStartLine = 1;
  let rowStartLine = 1;
  let rowTouched = false;
  let line = 1;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (rowTouched) rows.push({ line: rowStartLine, cells: row });
    row = [];
    rowTouched = false;
  };

  while (i < source.length) {
    const ch = source[i];

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        const next = source[i];
        if (next !== undefined && next !== ',' && next !== '\n' && next !== '\r') {
          errors.push({ line, message: 'Unexpected character after closing quote.' });
          field += next;
          i += 1;
        }
        continue;
      }
      if (ch === '\r') {
        field += source[i + 1] === '\n' ? '\r\n' : '\r';
        i += source[i + 1] === '\n' ? 2 : 1;
        line += 1;
        continue;
      }
      if (ch === '\n') {
        field += ch;
        i += 1;
        line += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      if (field === '') {
        inQuotes = true;
        quoteStartLine = line;
        rowTouched = true;
        i += 1;
        continue;
      }
      errors.push({ line, message: 'Unexpected quote in an unquoted field.' });
      field += ch;
      rowTouched = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      endField();
      rowTouched = true;
      i += 1;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      i += ch === '\r' && source[i + 1] === '\n' ? 2 : 1;
      endRow();
      line += 1;
      rowStartLine = line;
      continue;
    }

    field += ch;
    rowTouched = true;
    i += 1;
  }

  if (inQuotes) errors.push({ line: quoteStartLine, message: 'Unclosed quoted field.' });
  if (rowTouched || field !== '' || row.length > 0) endRow();

  return { rows, errors };
}

// Only strings are sanitised, so negative numbers stay numeric
function formatCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const s = typeof value === 'string' ? sanitizeCell(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((row) => row.map(formatCell).join(',')).join('\r\n');
}
