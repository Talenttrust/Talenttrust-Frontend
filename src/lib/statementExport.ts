import { toCsv, type Cell } from './csv';
import { ledgerSum, type Statement } from './statement';

export interface Reconciliation {
  ok: boolean;
  /** Ledger sum minus the nominal budget; null means a non-finite amount. */
  difference: number | null;
}

/** Includes the unfunded ledger line; never alters payouts or rounds a mismatch away. */
export function reconcile(statement: Statement): Reconciliation {
  const difference = ledgerSum(statement) - statement.totals.total;
  if (!Number.isFinite(statement.totals.total) || statement.lines.some((line) => !Number.isFinite(line.amount))
    || !Number.isFinite(difference)) return { ok: false, difference: null };
  return { ok: difference === 0, difference };
}

export const STATEMENT_HEADERS = [
  'recordType', 'escrowId', 'title', 'status', 'token', 'client', 'freelancer',
  'label', 'payee', 'amount', 'note', 'total', 'toFreelancer', 'toClient', 'held',
  'reconciled', 'difference',
];

/** One row per existing ledger line, followed by a totals/reconciliation footer. */
export function statementToCsv(statement: Statement): string {
  const identity: Cell[] = [statement.id, statement.title, statement.status, statement.token, statement.client, statement.freelancer];
  const rows: Cell[][] = statement.lines.map((line) => [
    'line', ...identity, line.label, line.to, line.amount, line.note, '', '', '', '', '', '',
  ]);
  const result = reconcile(statement);
  rows.push([
    'totals', ...identity, 'Total accounted for', '', ledgerSum(statement), '',
    statement.totals.total, statement.totals.toFreelancer, statement.totals.toClient, statement.totals.held,
    result.ok, result.difference,
  ]);
  return toCsv(STATEMENT_HEADERS, rows);
}

/** Fixed wire key order, independent of the insertion order of incoming objects. */
export function statementToJson(statement: Statement, generatedAt = new Date()): string {
  const dispute = statement.dispute;
  return JSON.stringify({
    id: statement.id,
    title: statement.title,
    status: statement.status,
    token: statement.token,
    client: statement.client,
    freelancer: statement.freelancer,
    createdAt: statement.createdAt ?? null,
    updatedAt: statement.updatedAt ?? null,
    dispute: dispute ? {
      raisedBy: dispute.raisedBy,
      reason: dispute.reason,
      openedAt: dispute.openedAt ?? null,
      freelancerBps: dispute.freelancerBps ?? null,
      resolvedAt: dispute.resolvedAt ?? null,
    } : null,
    lines: statement.lines.map((line) => ({ label: line.label, to: line.to, amount: line.amount, note: line.note ?? null })),
    totals: {
      total: statement.totals.total,
      toFreelancer: statement.totals.toFreelancer,
      toClient: statement.totals.toClient,
      held: statement.totals.held,
    },
    inProgress: statement.inProgress,
    reconciliation: reconcile(statement),
    generatedAt: generatedAt.toISOString(),
  }, null, 2);
}
