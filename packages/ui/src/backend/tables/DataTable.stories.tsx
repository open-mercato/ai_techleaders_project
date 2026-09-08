import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '../../components/ui/button';
import { DataTable, type DataTableProps } from './DataTable';

type Session = { id: string; mentor: string; topic: string; duration: string; status: string };
const sessions: Session[] = [
  { id: 'demo-1', mentor: 'Alex Laurent', topic: 'React state', duration: '25 min', status: 'Confirmed' },
  { id: 'demo-2', mentor: 'Sam Taylor', topic: 'TypeScript generics', duration: '50 min', status: 'Pending payment' },
  { id: 'demo-3', mentor: 'Jordan Chen', topic: 'Python typing', duration: '25 min', status: 'Completed' },
];
const args: DataTableProps<Session> = {
  columns: [{ key: 'mentor', header: 'Mentor' }, { key: 'topic', header: 'Topic' }, { key: 'duration', header: 'Length' }, { key: 'status', header: 'Status' }],
  caption: 'Mentoring sessions', rows: sessions, getRowId: row => row.id,
};
const meta = {
  title: 'Backend/Tables/DataTable', component: DataTable<Session>, tags: ['autodocs'], args,
  render: (props: DataTableProps<Session>) => <DataTable {...props} />,
  parameters: { docs: { description: { component: 'DataTable uses the shared feedback components for loading, error and empty states. This table has no built-in search, sorting or row selection. LongContent demonstrates wrapping and a named keyboard-scrollable region on narrow screens.' } } },
} satisfies Meta<DataTableProps<Session>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { error: 'We could not load your sessions. Please try again.' } };
export const Empty: Story = { args: { rows: [], emptyMessage: 'No confirmed sessions yet.' } };
export const CustomCellsAndActions: Story = {
  args: {
    columns: [{ key: 'mentor', header: 'Mentor', render: row => <strong>{row.mentor}</strong> }, ...args.columns.slice(1)],
    rowActions: row => <Button size="sm" variant="outline" onClick={fn()} aria-label={`View ${row.topic}`}>View</Button>,
  },
};
function PaginatedTable(props: DataTableProps<Session>) {
  const [page,setPage]=useState(1);
  return <DataTable {...props} rows={sessions.slice(page-1,page)} pagination={{ page, pageCount: sessions.length, onPageChange: setPage }} />;
}
export const Pagination: Story = {
  render: props => <PaginatedTable {...props} />,
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(canvas.getByText('Sam Taylor')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(canvas.getByRole('button', { name: 'Next' })).toBeDisabled();
  },
};
export const LongContent: Story = {
  args: { rows: [{ ...sessions[0]!, topic: 'Tracing a TypeScript generic constraint across a deeply nested React component with a long diagnostic identifier', mentor: 'Alexandra Laurent-Szczepańska' }] },
};
