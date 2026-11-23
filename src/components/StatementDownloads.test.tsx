import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildStatement } from '@/lib/statement';
import { StatementDownloads } from './StatementDownloads';
import { axe } from 'vitest-axe';

const statement = buildStatement({
  id: 7, title: 'Synthetic project', client: 'GCLIENT', freelancer: 'GFREE', token: 'USDC',
  milestones: [], totalAmount: 1000, fundedAmount: 400, releasedAmount: 0,
  status: 'Cancelled', reputationIssued: false,
});
let blobs: Blob[];
let downloads: { filename: string; href: string }[];

const readBlob = (blob: Blob): Promise<string> => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(blob);
});

beforeEach(() => {
  blobs = [];
  downloads = [];
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:synthetic-statement'; }),
    revokeObjectURL: vi.fn(),
  }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ filename: this.download, href: this.href });
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('statement downloads', () => {
  it('downloads UTF-8 CSV through the existing helper with the exact filename', async () => {
    render(<StatementDownloads statement={statement} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(downloads).toEqual([{ filename: 'talenttrust-statement-7.csv', href: 'blob:synthetic-statement' }]);
    expect(blobs[0].type).toBe('text/csv;charset=utf-8');
    const text = await readBlob(blobs[0]);
    expect(text).toContain('Refund to client,client,400');
    expect(text).toContain('Unfunded remainder,escrow,600');
    expect(text).toContain(',true,0');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-statement');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('downloads JSON with all totals and reconciliation, releasing the temporary URL', async () => {
    render(<StatementDownloads statement={statement} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(downloads[0].filename).toBe('talenttrust-statement-7.json');
    expect(blobs[0].type).toBe('application/json;charset=utf-8');
    const data = JSON.parse(await readBlob(blobs[0]));
    expect(data.totals).toEqual({ total: 1000, toFreelancer: 0, toClient: 400, held: 600 });
    expect(data.reconciliation).toEqual({ ok: true, difference: 0 });
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('reports download failures without exposing exception details and allows retry', () => {
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error('private-failure-canary'); });
    render(<StatementDownloads statement={statement} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not download the statement. Please try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('private-failure-canary');
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(downloads).toHaveLength(1);
  });

  it('cleans up a JSON download even when the browser rejects the click', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementationOnce(() => { throw new Error('blocked'); });
    render(<StatementDownloads statement={statement} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('has accessible button names and performs no automatic downloads', async () => {
    const { container } = render(<StatementDownloads statement={statement} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });
});
