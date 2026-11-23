'use client';

import { useState } from 'react';
import type { Statement } from '@/lib/statement';
import { statementToCsv, statementToJson } from '@/lib/statementExport';
import { downloadCsv } from '@/lib/exportContracts';

export function StatementDownloads({ statement }: { statement: Statement }) {
  const [error, setError] = useState<string | null>(null);

  const download = (format: 'csv' | 'json') => {
    setError(null);
    try {
      const filename = `talenttrust-statement-${statement.id}.${format}`;
      if (format === 'csv') {
        downloadCsv(statementToCsv(statement), filename);
      } else {
        const url = URL.createObjectURL(new Blob([statementToJson(statement)], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a');
        try {
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
        } finally {
          link.remove();
          URL.revokeObjectURL(url);
        }
      }
    } catch {
      setError('Could not download the statement. Please try again.');
    }
  };

  return (
    <div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('csv')}>Download CSV</button>{' '}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('json')}>Download JSON</button>
      {error && <p role="alert" className="alert alert-error small">{error}</p>}
    </div>
  );
}
