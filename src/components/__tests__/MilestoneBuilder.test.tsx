import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_MILESTONES,
  MilestoneBuilder,
  formatStroops,
  newMilestone,
  totalStroops,
  validateMilestones,
  type MilestoneInput,
} from '@/components/MilestoneBuilder';
import { EscrowDashboard } from '@/components/EscrowDashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const rows = (...pairs: Array<[string, string]>) => pairs.map(([t, a]) => newMilestone(t, a));

describe('validateMilestones', () => {
  it.each([
    ['empty title', [['', '10']], { title: 'Enter a milestone title.' }],
    ['title over 80 chars', [['x'.repeat(81), '10']], { title: 'Titles can be at most 80 characters.' }],
    ['zero amount', [['A', '0']], { amount: 'The amount must be greater than 0.' }],
    ['negative amount', [['A', '-5']], { amount: 'Enter a number, for example 300 or 12.5.' }],
    ['NaN amount', [['A', 'abc']], { amount: 'Enter a number, for example 300 or 12.5.' }],
    ['8 decimals', [['A', '1.12345678']], { amount: 'Use at most 7 decimal places.' }],
    ['empty amount', [['A', '']], { amount: 'Enter an amount.' }],
  ] as const)('rejects %s', (_name, input, expected) => {
    const result = validateMilestones(rows(...(input as unknown as Array<[string, string]>)));
    expect(result.valid).toBe(false);
    expect(result.rows[0]).toEqual(expected);
  });

  it('rejects more than 20 rows with a form-level error', () => {
    const many = Array.from({ length: MAX_MILESTONES + 1 }, (_, i) => newMilestone(`M${i}`, '1'));
    const result = validateMilestones(many);
    expect(result.valid).toBe(false);
    expect(result.form).toBe('An escrow can have at most 20 milestones.');
  });

  it('accepts a valid set', () => {
    expect(validateMilestones(rows(['Design', '300'], ['Build', '0.0000001'])).valid).toBe(true);
  });

  it('totals amounts exactly in stroops', () => {
    expect(formatStroops(totalStroops(rows(['A', '0.1'], ['B', '0.2'])))).toBe('0.3');
  });
});

function Harness({ initial }: { initial: MilestoneInput[] }) {
  const [value, setValue] = useState(initial);
  return <MilestoneBuilder milestones={value} onChange={setValue} />;
}

describe('MilestoneBuilder', () => {
  it('names every row control and shows a live total', () => {
    render(<Harness initial={rows(['Design', '300'], ['Build', '700'])} />);

    expect(screen.getByRole('button', { name: 'Remove milestone 2: Build' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move milestone 1: Design down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move milestone 1: Design up' })).toBeDisabled();
    expect(screen.getByText('2 milestones · Total 1000 XLM')).toBeInTheDocument();
  });

  it('disables Remove with a single row and Add at the 20-row limit', () => {
    const { unmount } = render(<Harness initial={rows(['Only', '1'])} />);
    expect(screen.getByRole('button', { name: 'Remove milestone 1: Only' })).toBeDisabled();
    unmount();

    render(<Harness initial={Array.from({ length: MAX_MILESTONES }, (_, i) => newMilestone(`M${i}`, '1'))} />);
    expect(screen.getByRole('button', { name: 'Add milestone' })).toBeDisabled();
    expect(screen.getByText('An escrow can have at most 20 milestones.')).toBeInTheDocument();
  });

  it('adds, moves and removes rows with the keyboard and announces changes', async () => {
    const user = userEvent.setup();
    render(<Harness initial={rows(['Design', '300'])} />);

    screen.getByRole('button', { name: 'Add milestone' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByLabelText('Milestone 2 title')).toHaveFocus());
    await user.keyboard('Build');
    await user.click(screen.getByRole('button', { name: 'Move milestone 2: Build up' }));
    expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('Build');
    expect(screen.getByText('Moved milestone 2: Build to position 1.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove milestone 1: Build' }));
    expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('Design');
    expect(screen.getByText('Removed milestone 1: Build.')).toBeInTheDocument();
  });
});

describe('EscrowDashboard create form with the milestone builder', () => {
  const fetchMock = vi.fn();
  const reply = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => reply({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const fillParties = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Client address'), 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
    await user.type(screen.getByLabelText('Freelancer address'), 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV');
  };

  it('sends titles verbatim and milestones in row order after reordering', async () => {
    render(<EscrowDashboard />);
    await screen.findByText('No escrows yet. Create the first one.');
    const user = userEvent.setup();
    await fillParties(user);

    const title2 = screen.getByLabelText('Milestone 2 title');
    await user.clear(title2);
    await user.type(title2, 'Phase 2: Build, test');
    await user.click(screen.getByRole('button', { name: 'Move milestone 2: Phase 2: Build, test up' }));
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    const body = JSON.parse((posts()[0][1] as RequestInit).body as string);
    expect(body.milestones).toEqual([
      { title: 'Phase 2: Build, test', amount: 700 },
      { title: 'Design', amount: 300 },
    ]);
  });

  it('blocks submit on invalid milestones and focuses the first invalid field', async () => {
    render(<EscrowDashboard />);
    await screen.findByText('No escrows yet. Create the first one.');
    const user = userEvent.setup();
    await fillParties(user);

    await user.clear(screen.getByLabelText('Milestone 1 amount (XLM)'));
    await user.type(screen.getByLabelText('Milestone 1 amount (XLM)'), '300 XLM');
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    expect(await screen.findByText('Enter a number, for example 300 or 12.5.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Milestone 1 amount (XLM)')).toHaveFocus());
    expect(posts()).toHaveLength(0);
  });

  it('shows the API error when the create request fails', async () => {
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) =>
      init?.method === 'POST' ? reply({ message: 'invalid milestones' }, 400) : reply({ data: [] }),
    );
    render(<EscrowDashboard />);
    await screen.findByText('No escrows yet. Create the first one.');
    const user = userEvent.setup();
    await fillParties(user);
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    expect(await screen.findByRole('alert')).toHaveAttribute('title', 'invalid milestones');
  });
});

describe('MilestoneBuilder CSV import', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => true),
    });
  });

  const upload = async (text: string, name = 'milestones.csv') => {
    const user = userEvent.setup();
    const file = new File([text], name, { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Choose a milestone CSV file'), file);
  };

  it('offers an Import CSV button and a downloadable template', () => {
    render(<Harness initial={rows(['Design', '300'])} />);

    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Download template' });
    expect(link).toHaveAttribute('download', 'milestones-template.csv');
    const href = decodeURIComponent(link.getAttribute('href') ?? '');
    expect(href).toContain('title,amount');
    expect(href).toContain('Design,300');
  });

  it('imports a valid CSV after confirmation and announces success', async () => {
    render(<Harness initial={rows(['Existing', '1'])} />);

    await upload('title,amount\nDesign,300\nBuild,700\n');

    await waitFor(() => expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('Design'));
    expect(screen.getByLabelText('Milestone 2 title')).toHaveValue('Build');
    expect(screen.getByLabelText('Milestone 1 amount (XLM)')).toHaveValue('300');
    expect(screen.getByText('Imported 2 milestones.')).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('keeps existing rows when the replacement is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<Harness initial={rows(['Existing', '1'])} />);

    await upload('title,amount\nDesign,300\n');

    await waitFor(() =>
      expect(screen.getByText('Import cancelled. Existing milestones were kept.')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('Existing');
  });

  it('shows line-level errors and leaves the builder untouched', async () => {
    render(<Harness initial={rows(['Existing', '1'])} />);

    await upload('title,amount\n,300\nDesign,abc\n', 'bad.csv');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Line 2: Enter a milestone title.');
    expect(alert).toHaveTextContent('Line 3: Enter a number, for example 300 or 12.5.');
    expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('Existing');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByText('Import failed with 2 errors.')).toBeInTheDocument();
  });

  it('reports malformed files without changing the builder', async () => {
    render(<Harness initial={rows(['Existing', '1'])} />);

    await upload('title,amount\n"Design,300\n', 'unclosed.csv');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Line 2: Unclosed quoted field.');
    expect(screen.getByLabelText('Milestone 1 title')).toHaveValue('Existing');
  });
});
