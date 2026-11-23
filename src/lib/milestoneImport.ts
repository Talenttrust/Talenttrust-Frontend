import {
  MAX_MILESTONES,
  newMilestone,
  validateMilestones,
  type MilestoneInput,
} from '@/components/MilestoneBuilder';
import { isFormulaInjection, parseCsv } from './csv';

export interface MilestoneImportError {
  /** 1-based CSV line (the header is line 1). */
  line: number;
  message: string;
}

export interface MilestoneImportResult {
  rows: MilestoneInput[];
  errors: MilestoneImportError[];
}

const REQUIRED_HEADERS = ['title', 'amount'] as const;
const FORMULA_TITLE_MESSAGE =
  'Titles cannot start with =, +, -, @, a tab, or a carriage return.';

/**
 * Parse and validate milestone CSV text.
 *
 * Every row goes through the same `validateMilestones` rules as the manual
 * builder. Any error makes the whole import fail (`rows` is empty) so callers
 * can apply a valid import atomically.
 */
export function parseMilestoneCsv(text: string): MilestoneImportResult {
  const { rows: csvRows, errors: csvErrors } = parseCsv(text);
  if (csvErrors.length > 0) return { rows: [], errors: csvErrors };

  if (csvRows.length === 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'The CSV is empty. Add a header row with title and amount.' }],
    };
  }

  const header = csvRows[0];
  const normalizedHeader = header.cells.map((cell) => cell.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter((name) => !normalizedHeader.includes(name));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: header.line,
          message: `The CSV header must include ${missing.join(' and ')}. Expected columns: title,amount.`,
        },
      ],
    };
  }

  const titleIndex = normalizedHeader.indexOf('title');
  const amountIndex = normalizedHeader.indexOf('amount');
  const dataRows = csvRows.slice(1);

  if (dataRows.length === 0) {
    return { rows: [], errors: [{ line: header.line + 1, message: 'Add at least one milestone.' }] };
  }

  const errors: MilestoneImportError[] = [];
  const imported: MilestoneInput[] = [];

  dataRows.forEach((row, index) => {
    if (index >= MAX_MILESTONES) {
      if (index === MAX_MILESTONES) {
        errors.push({
          line: row.line,
          message: `An escrow can have at most ${MAX_MILESTONES} milestones.`,
        });
      }
      return;
    }

    if (row.cells.length > header.cells.length) {
      errors.push({
        line: row.line,
        message: `Expected ${header.cells.length} columns but found ${row.cells.length}.`,
      });
      return;
    }

    const title = (row.cells[titleIndex] ?? '').trim();
    const amount = (row.cells[amountIndex] ?? '').trim();

    if (isFormulaInjection(title)) {
      errors.push({ line: row.line, message: FORMULA_TITLE_MESSAGE });
      return;
    }

    const milestone = newMilestone(title, amount);
    const rowErrors = validateMilestones([milestone]).rows[0] ?? {};
    if (rowErrors.title) errors.push({ line: row.line, message: rowErrors.title });
    if (rowErrors.amount) errors.push({ line: row.line, message: rowErrors.amount });
    if (!rowErrors.title && !rowErrors.amount) imported.push(milestone);
  });

  if (errors.length > 0) return { rows: [], errors };
  return { rows: imported, errors: [] };
}
