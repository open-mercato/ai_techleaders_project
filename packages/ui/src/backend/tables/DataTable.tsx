'use client';

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { LoadingMessage } from '../feedback/LoadingMessage';
import { ErrorMessage } from '../feedback/ErrorMessage';
import { EmptyState } from '../feedback/EmptyState';

export interface Column<Row> {
  /** Property key on the row; also the default cell value when `render` is omitted. */
  key: string;
  header: string;
  render?: (row: Row) => ReactNode;
  className?: string;
}

export interface DataTablePagination {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[] | undefined;
  getRowId: (row: Row) => string;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  rowActions?: (row: Row) => ReactNode;
  pagination?: DataTablePagination;
}

/**
 * Column-config-driven list with built-in loading/error/empty states and optional
 * pagination + row actions. Use for every list screen instead of a hand-rolled
 * `<table>` + `.map()`.
 */
export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  loading = false,
  error = null,
  emptyMessage = 'Nothing here yet.',
  rowActions,
  pagination,
}: DataTableProps<Row>) {
  if (loading) {
    return <LoadingMessage />;
  }
  if (error) {
    return <ErrorMessage message={error} />;
  }
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cn('px-4 py-2 font-medium', column.className)}>
                  {column.header}
                </th>
              ))}
              {rowActions ? <th className="px-4 py-2" aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowId(row)} className="border-t border-border">
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-2', column.className)}>
                    {column.render
                      ? column.render(row)
                      : String((row as Record<string, unknown>)[column.key] ?? '')}
                  </td>
                ))}
                {rowActions ? (
                  <td className="px-4 py-2 text-right">{rowActions(row)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.pageCount > 1 ? (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.pageCount}
            onClick={() => pagination.onPageChange(pagination.page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
