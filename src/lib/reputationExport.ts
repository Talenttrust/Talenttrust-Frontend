import { exportData } from '@/utils/export';
import type { ReputationEvent } from '@/components/ReputationProfile';

type ExportFormat = 'csv' | 'json';

export function exportReputationHistory(
  events: ReputationEvent[],
  format: ExportFormat,
  filename = 'reputation-history'
): void {
  const rows = events.map((e) => ({
    id: e.id,
    type: e.type,
    summary: e.summary,
    date: e.date,
    version: e.version ?? '',
  }));
  exportData(rows, filename, format);
}
