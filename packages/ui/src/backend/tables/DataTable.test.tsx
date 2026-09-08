// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DataTable, type DataTableProps } from './DataTable';
type Row = { id: string; name?: string | null };
const base: DataTableProps<Row> = { columns: [{ key: 'name', header: 'Name' }], rows: [{ id: '1', name: 'Alex' }], getRowId: row => row.id };
afterEach(cleanup);
it('prioritizes loading, then error, then absence of rows', () => {
  const { rerender } = render(<DataTable {...base} loading error="Unavailable" />);
  expect(screen.getByRole('status')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  rerender(<DataTable {...base} error="Unavailable" />);
  expect(screen.getByRole('alert').textContent).toBe('Unavailable');
  const retry = vi.fn();
  rerender(<DataTable {...base} error="Unavailable" onRetry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledOnce();
  rerender(<DataTable {...base} rows={undefined} />);
  expect(screen.getByText('Nothing here yet.')).toBeTruthy();
  rerender(<DataTable {...base} rows={[]} emptyMessage="No mentors" emptyDescription="Publish your first profile." emptyAction={<button>Create profile</button>} />);
  expect(screen.getByText('No mentors')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create profile' })).toBeTruthy();
});
it('names the table and its keyboard-scrollable region and uses column headers', () => {
  render(<DataTable {...base} caption="Mentors" />);
  expect(screen.getByRole('table', { name: 'Mentors' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Mentors table' }).tabIndex).toBe(0);
  expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('scope')).toBe('col');
  expect(screen.getByRole('cell', { name: 'Alex' })).toBeTruthy();
});
it('supports default names, custom renderers, actions, classes and absent values', () => {
  const action = vi.fn();
  const { rerender } = render(<DataTable {...base} rows={[{ id:'1', name:null }, {id:'2'}]} />);
  expect(within(screen.getByRole('table', { name: 'Records' })).getAllByRole('cell').map(x => x.textContent)).toEqual(['','']);
  rerender(<DataTable {...base} columns={[{key:'name',header:'Name',className:'name-column',render:row=><strong>{row.name}</strong>}]} rowActions={row=><button onClick={()=>action(row.id)}>View {row.name}</button>} />);
  expect(screen.getByRole('columnheader', { name: 'Actions' }).getAttribute('scope')).toBe('col');
  expect(screen.getByRole('cell', { name: 'Alex' }).classList.contains('name-column')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'View Alex' }));
  expect(action).toHaveBeenCalledWith('1');
});
it('paginates in both directions and disables boundary actions', () => {
  const change = vi.fn();
  const { rerender } = render(<DataTable {...base} pagination={{page:1,pageCount:3,onPageChange:change}} />);
  expect((screen.getByRole('button', {name:'Previous'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', {name:'Next'}));
  expect(change).toHaveBeenLastCalledWith(2);
  rerender(<DataTable {...base} pagination={{page:3,pageCount:3,onPageChange:change}} />);
  expect((screen.getByRole('button', {name:'Next'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', {name:'Previous'}));
  expect(change).toHaveBeenLastCalledWith(2);
  rerender(<DataTable {...base} pagination={{page:1,pageCount:1,onPageChange:change}} />);
  expect(screen.queryByRole('navigation')).toBeNull();
});
