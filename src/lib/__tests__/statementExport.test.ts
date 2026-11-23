import { describe, expect, it } from 'vitest';
import { buildStatement, type Statement } from '@/lib/statement';
import { reconcile, statementToCsv, statementToJson, STATEMENT_HEADERS } from '@/lib/statementExport';
import type { EscrowContract } from '@/lib/api';

const GENERATED_AT = new Date('2026-11-22T12:00:00.000Z');
const contract = (overrides: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 7, title: 'Synthetic project', client: 'GCLIENT', freelancer: 'GFREE', token: 'USDC',
  milestones: [{ index: 0, title: 'Design', amount: 300, released: true }],
  totalAmount: 1000, fundedAmount: 1000, releasedAmount: 300, status: 'Cancelled', reputationIssued: false,
  createdAt: '2026-01-02T10:00:00.000Z', updatedAt: '2026-01-05T12:30:00.000Z', ...overrides,
});

describe('escrow statement exports', () => {
  it.each([
    ['Resolved', { status: 'Resolved', dispute: { raisedBy: 'GCLIENT', reason: 'scope', freelancerBps: 5000, openedAt: '2026-01-04', resolvedAt: '2026-01-05' } }, [650, 350, 0]],
    ['Cancelled', {}, [300, 700, 0]],
    ['underfunded Cancelled', { fundedAmount: 400 }, [300, 100, 600]],
    ['underfunded active', { status: 'Funded', fundedAmount: 400 }, [300, 0, 700]],
  ] as const)('includes every ledger line and totals for %s', (_, overrides, totals) => {
    const statement = buildStatement(contract(overrides));
    const result = reconcile(statement);
    expect(result).toEqual({ ok: true, difference: 0 });
    const csv = statementToCsv(statement).split('\r\n').map((line) => line.split(','));
    expect(csv[0]).toEqual(STATEMENT_HEADERS);
    expect(csv).toHaveLength(statement.lines.length + 2);
    statement.lines.forEach((line, index) => {
      expect(csv[index + 1].slice(0, 7)).toEqual(['line', '7', 'Synthetic project', statement.status, 'USDC', 'GCLIENT', 'GFREE']);
      expect(csv[index + 1].slice(7, 11)).toEqual([line.label, line.to, String(line.amount), line.note ?? '']);
      expect(csv[index + 1]).toHaveLength(STATEMENT_HEADERS.length);
    });
    expect(csv.at(-1)?.slice(9)).toEqual(['1000', '', '1000', ...totals.map(String), 'true', '0']);
    const json = JSON.parse(statementToJson(statement, GENERATED_AT));
    expect(json.lines).toEqual(statement.lines.map((line) => ({ ...line, note: line.note ?? null })));
    expect(json.totals).toEqual({ total: 1000, toFreelancer: totals[0], toClient: totals[1], held: totals[2] });
    expect(json.reconciliation).toEqual(result);
    expect(json.generatedAt).toBe(GENERATED_AT.toISOString());
    if (statement.dispute) expect(json.dispute).toEqual(statement.dispute);
  });

  it('preserves the existing floor rounding and client dust in resolved escrows', () => {
    const statement = buildStatement(contract({ totalAmount: 101, fundedAmount: 101, releasedAmount: 0, milestones: [], status: 'Resolved', dispute: { raisedBy: 'GCLIENT', reason: 'scope', freelancerBps: 5000 } }));
    expect(JSON.parse(statementToJson(statement, GENERATED_AT)).totals).toEqual({ total: 101, toFreelancer: 50, toClient: 51, held: 0 });
    expect(reconcile(statement)).toEqual({ ok: true, difference: 0 });
  });

  it.each([-1, 1, 0.000001])('exports an exact mismatch of %s without silently rounding it', (difference) => {
    const statement = buildStatement(contract());
    statement.lines[0].amount += difference;
    const expected = statement.lines.reduce((sum, line) => sum + line.amount, 0) - statement.totals.total;
    expect(reconcile(statement)).toEqual({ ok: false, difference: expected });
    expect(JSON.parse(statementToJson(statement, GENERATED_AT)).reconciliation).toEqual({ ok: false, difference: expected });
    expect(statementToCsv(statement)).toContain(`,false,${expected}`);
  });

  it.each([NaN, Infinity, -Infinity])('rejects a non-finite ledger amount %s', (amount) => {
    const statement = buildStatement(contract());
    statement.lines[0].amount = amount;
    expect(reconcile(statement)).toEqual({ ok: false, difference: null });
    expect(JSON.parse(statementToJson(statement, GENERATED_AT)).reconciliation).toEqual({ ok: false, difference: null });
    expect(statementToCsv(statement)).toMatch(/,false,$/);
  });

  it('rejects non-finite budgets and overflowing sums', () => {
    const statement = buildStatement(contract());
    expect(reconcile({ ...statement, totals: { ...statement.totals, total: NaN } })).toEqual({ ok: false, difference: null });
    expect(reconcile({ ...statement, lines: [{ label: 'one', to: 'escrow', amount: Number.MAX_VALUE }, { label: 'two', to: 'escrow', amount: Number.MAX_VALUE }] })).toEqual({ ok: false, difference: null });
  });

  it('escapes CSV formulas, commas, quotes, newlines and non-ASCII text using the existing sanitizer', () => {
    const statement = buildStatement(contract({ title: '=2+2', client: '+formula', freelancer: '@formula' }));
    statement.lines = [{ label: '设计, "phase"\nnext', to: 'escrow', amount: 1000, note: '=SUM(A1)' }];
    const csv = statementToCsv(statement);
    expect(csv).toContain("'=2+2");
    expect(csv).toContain("'+formula");
    expect(csv).toContain("'@formula");
    expect(csv).toContain('"设计, ""phase""\nnext"');
    expect(csv).toContain("'=SUM(A1)");
    expect(JSON.parse(statementToJson(statement, GENERATED_AT)).title).toBe('=2+2');
  });

  it('uses stable key order and does not mutate statements or disclose extra input fields', () => {
    const statement = buildStatement(contract({ status: 'Resolved', dispute: { raisedBy: 'GCLIENT', reason: 'scope', freelancerBps: 0 } }));
    const before = JSON.stringify(statement);
    const reordered = Object.fromEntries(Object.entries(statement).reverse()) as unknown as Statement;
    reordered.lines = statement.lines.map((line) => Object.fromEntries(Object.entries(line).reverse()) as unknown as Statement['lines'][number]);
    reordered.totals = Object.fromEntries(Object.entries(statement.totals).reverse()) as unknown as Statement['totals'];
    reordered.dispute = Object.fromEntries(Object.entries(statement.dispute!).reverse()) as unknown as Statement['dispute'];
    const withExtra = { ...reordered, accessToken: 'private-canary' };
    expect(statementToJson(withExtra, GENERATED_AT)).toBe(statementToJson(statement, GENERATED_AT));
    expect(statementToJson(withExtra, GENERATED_AT)).not.toContain('private-canary');
    expect(JSON.stringify(statement)).toBe(before);
    expect(Object.keys(JSON.parse(statementToJson(statement, GENERATED_AT)))).toEqual(['id', 'title', 'status', 'token', 'client', 'freelancer', 'createdAt', 'updatedAt', 'dispute', 'lines', 'totals', 'inProgress', 'reconciliation', 'generatedAt']);
  });

  it('supports a zero-budget statement, absent optional fields, default timestamp and no ledger rows', () => {
    const statement = buildStatement(contract({ totalAmount: 0, fundedAmount: 0, releasedAmount: 0, milestones: [], status: 'Completed', createdAt: undefined, updatedAt: undefined }));
    const csv = statementToCsv(statement).split('\r\n');
    expect(csv).toHaveLength(2);
    expect(csv[1]).toContain(',true,0');
    const json = JSON.parse(statementToJson(statement));
    expect(json).toMatchObject({ createdAt: null, updatedAt: null, dispute: null, lines: [], reconciliation: { ok: true, difference: 0 } });
    expect(Number.isNaN(Date.parse(json.generatedAt))).toBe(false);
  });
});
