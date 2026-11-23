'use client';

import { useId, useRef, useState } from 'react';
import { toCsv } from '@/lib/csv';
import type { MilestoneImportError } from '@/lib/milestoneImport';

export const MAX_MILESTONE_TITLE_LENGTH = 80;
export const MAX_MILESTONES = 20;
/** Stellar amounts have at most 7 decimal places (1 stroop = 0.0000001). */
export const MAX_AMOUNT_DECIMALS = 7;

const MILESTONE_CSV_TEMPLATE = toCsv(
  ['title', 'amount'],
  [
    ['Design', '300'],
    ['Build', '700'],
  ],
);
const MILESTONE_CSV_TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(MILESTONE_CSV_TEMPLATE)}`;

export interface MilestoneInput {
  id: string;
  title: string;
  amount: string;
}

export interface MilestoneRowErrors {
  title?: string;
  amount?: string;
}

export interface MilestoneValidation {
  rows: MilestoneRowErrors[];
  form?: string;
  valid: boolean;
}

let nextId = 0;
/** Creates a row with a stable id for React keys and focus management. */
export function newMilestone(title = '', amount = ''): MilestoneInput {
  nextId += 1;
  return { id: `milestone-${nextId}`, title, amount };
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}

const AMOUNT_RE = new RegExp(`^\\d+(?:\\.\\d{1,${MAX_AMOUNT_DECIMALS}})?$`);

/** Parses a decimal amount into integer stroops; null when it is not a valid amount. */
export function toStroops(amount: string): bigint | null {
  const value = amount.trim();
  if (!AMOUNT_RE.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(MAX_AMOUNT_DECIMALS, '0'));
}

/** Formats integer stroops as a decimal string without float drift (e.g. 0.1 + 0.2 -> "0.3"). */
export function formatStroops(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const fraction = (stroops % 10_000_000n).toString().padStart(MAX_AMOUNT_DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Sum of all valid row amounts, in stroops. */
export function totalStroops(rows: MilestoneInput[]): bigint {
  return rows.reduce((sum, row) => sum + (toStroops(row.amount) ?? 0n), 0n);
}

/** Pure validation: per-row field errors plus a form-level error. */
export function validateMilestones(rows: MilestoneInput[]): MilestoneValidation {
  const errors = rows.map((row): MilestoneRowErrors => {
    const out: MilestoneRowErrors = {};
    const title = row.title.trim();
    if (!title) out.title = 'Enter a milestone title.';
    else if (title.length > MAX_MILESTONE_TITLE_LENGTH) {
      out.title = `Titles can be at most ${MAX_MILESTONE_TITLE_LENGTH} characters.`;
    }
    const amount = row.amount.trim();
    const stroops = toStroops(amount);
    if (!amount) out.amount = 'Enter an amount.';
    else if (/^\d+\.\d{8,}$/.test(amount)) out.amount = `Use at most ${MAX_AMOUNT_DECIMALS} decimal places.`;
    else if (stroops === null) out.amount = 'Enter a number, for example 300 or 12.5.';
    else if (stroops <= 0n) out.amount = 'The amount must be greater than 0.';
    return out;
  });
  let form: string | undefined;
  if (rows.length === 0) form = 'Add at least one milestone.';
  else if (rows.length > MAX_MILESTONES) form = `An escrow can have at most ${MAX_MILESTONES} milestones.`;
  const valid = !form && errors.every((e) => !e.title && !e.amount);
  return { rows: errors, form, valid };
}

export interface MilestoneBuilderProps {
  /** Current milestones (controlled). */
  milestones: MilestoneInput[];
  onChange: (milestones: MilestoneInput[]) => void;
  /** Token code shown next to amounts and in the total. */
  currencySymbol?: string;
  /** Errors to show (usually from validateMilestones after a submit attempt). */
  errors?: MilestoneValidation | null;
}

/**
 * Structured milestone entry: one row per milestone (title + amount) with
 * add / remove / reorder, a live total and per-field errors.
 */
export function MilestoneBuilder({ milestones, onChange, currencySymbol = 'XLM', errors }: MilestoneBuilderProps) {
  const uid = useId();
  const [announcement, setAnnouncement] = useState('');
  const [importErrors, setImportErrors] = useState<MilestoneImportError[]>([]);
  const addRef = useRef<HTMLButtonElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const label = (row: MilestoneInput, index: number) =>
    `milestone ${index + 1}${row.title.trim() ? `: ${row.title.trim()}` : ''}`;

  const focusTitle = (index: number) => {
    requestAnimationFrame(() => {
      const inputs = rowsRef.current?.querySelectorAll<HTMLInputElement>('input[data-field="title"]');
      const target = inputs?.[index];
      if (target) target.focus();
      else addRef.current?.focus();
    });
  };

  const update = (index: number, field: 'title' | 'amount', value: string) => {
    onChange(milestones.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const add = () => {
    if (milestones.length >= MAX_MILESTONES) return;
    onChange([...milestones, newMilestone()]);
    setAnnouncement(`Milestone ${milestones.length + 1} added.`);
    focusTitle(milestones.length);
  };

  const remove = (index: number) => {
    if (milestones.length <= 1) return;
    const removed = milestones[index];
    onChange(milestones.filter((_, i) => i !== index));
    setAnnouncement(`Removed ${label(removed, index)}.`);
    // Focus the row that took its place, else the previous row, else Add.
    focusTitle(index < milestones.length - 1 ? index : index - 1);
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= milestones.length) return;
    const next = [...milestones];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setAnnouncement(`Moved ${label(milestones[index], index)} to position ${target + 1}.`);
    focusTitle(target);
  };

  const importCsv = async (file: File) => {
    setImportErrors([]);
    setAnnouncement('');

    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      const message = 'Could not read the selected file.';
      setImportErrors([{ line: 1, message }]);
      setAnnouncement(`Import failed. ${message}`);
      return;
    }

    const { parseMilestoneCsv } = await import('@/lib/milestoneImport');
    const result = parseMilestoneCsv(text);

    if (result.errors.length > 0) {
      setImportErrors(result.errors);
      setAnnouncement(
        `Import failed with ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}.`,
      );
      return;
    }

    if (
      milestones.length > 0 &&
      !window.confirm(
        `Replace the current ${milestones.length} milestone${milestones.length === 1 ? '' : 's'} with ${result.rows.length} imported milestone${result.rows.length === 1 ? '' : 's'}?`,
      )
    ) {
      setAnnouncement('Import cancelled. Existing milestones were kept.');
      return;
    }

    onChange(result.rows);
    setAnnouncement(
      `Imported ${result.rows.length} milestone${result.rows.length === 1 ? '' : 's'}.`,
    );
  };

  const total = formatStroops(totalStroops(milestones));
  const atLimit = milestones.length >= MAX_MILESTONES;
  const limitId = `${uid}-limit`;

  return (
    <fieldset className="milestone-builder">
      <legend>Milestones</legend>
      {errors?.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="milestone-rows" ref={rowsRef}>
        {milestones.map((row, index) => {
          const rowErrors = errors?.rows[index] ?? {};
          const titleId = `${uid}-title-${row.id}`;
          const amountId = `${uid}-amount-${row.id}`;
          return (
            <div className="milestone-row" key={row.id}>
              <div className="field">
                <label htmlFor={titleId}>Milestone {index + 1} title</label>
                <input
                  id={titleId}
                  data-field="title"
                  className="input"
                  value={row.title}
                  maxLength={MAX_MILESTONE_TITLE_LENGTH + 20}
                  aria-invalid={rowErrors.title ? true : undefined}
                  aria-describedby={rowErrors.title ? `${titleId}-error` : undefined}
                  onChange={(e) => update(index, 'title', e.target.value)}
                />
                {rowErrors.title && (
                  <span id={`${titleId}-error`} className="field-error">
                    {rowErrors.title}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor={amountId}>Milestone {index + 1} amount ({currencySymbol})</label>
                <input
                  id={amountId}
                  data-field="amount"
                  className="input mono"
                  inputMode="decimal"
                  value={row.amount}
                  aria-invalid={rowErrors.amount ? true : undefined}
                  aria-describedby={rowErrors.amount ? `${amountId}-error` : undefined}
                  onChange={(e) => update(index, 'amount', e.target.value)}
                />
                {rowErrors.amount && (
                  <span id={`${amountId}-error`} className="field-error">
                    {rowErrors.amount}
                  </span>
                )}
              </div>
              <div className="row milestone-row-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={index === 0}
                  aria-label={`Move ${label(row, index)} up`}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={index === milestones.length - 1}
                  aria-label={`Move ${label(row, index)} down`}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={milestones.length <= 1}
                  aria-label={`Remove ${label(row, index)}`}
                  onClick={() => remove(index)}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        ref={addRef}
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={atLimit}
        aria-describedby={atLimit ? limitId : undefined}
        onClick={add}
      >
        Add milestone
      </button>
      {atLimit && (
        <span id={limitId} className="small muted">
          An escrow can have at most {MAX_MILESTONES} milestones.
        </span>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fileRef.current?.click()}
        >
          Import CSV
        </button>
        <a
          href={MILESTONE_CSV_TEMPLATE_HREF}
          download="milestones-template.csv"
          className="btn btn-secondary btn-sm"
        >
          Download template
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose a milestone CSV file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importCsv(file);
          }}
        />
      </div>
      {importErrors.length > 0 && (
        <div className="field-error" role="alert">
          <p>Fix these CSV problems and try again:</p>
          <ul>
            {importErrors.map((error, index) => (
              <li key={`${error.line}-${index}`}>
                Line {error.line}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="small milestone-total" aria-live="polite">
        {milestones.length} {milestones.length === 1 ? 'milestone' : 'milestones'} · Total {total} {currencySymbol}
      </p>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </fieldset>
  );
}
