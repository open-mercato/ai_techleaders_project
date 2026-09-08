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
  /** Accessible table name; describe the records shown. */
  caption?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
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
  caption = 'Records',
  emptyDescription,
  emptyAction,
  onRetry,
}: DataTableProps<Row>) {
  if (loading) {
    return <LoadingMessage />;
  }
  if (error) {
    return <ErrorMessage message={error} action={onRetry ? <Button intent="neutral" appearance="stroke" size="sm" onClick={onRetry}>Try again</Button> : undefined} />;
  }
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="dm-data-table">
      <div className="dm-table-scroll" role="region" aria-label={`${caption} table`} tabIndex={0}>
        <table className="dm-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column.key} className={cn(column.className)}>
                  {column.header}
                </th>
              ))}
              {rowActions ? <th scope="col" aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowId(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={cn(column.className)}>
                    {column.render
                      ? column.render(row)
                      : String((row as Record<string, unknown>)[column.key] ?? '')}
                  </td>
                ))}
                {rowActions ? (
                  <td className="dm-table-actions">{rowActions(row)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.pageCount > 1 ? (
        <nav aria-label={`${caption} pagination`} className="dm-table-pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
          >
            Previous
          </Button>
          <span aria-live="polite">
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
        </nav>
      ) : null}
    </div>
  );
}
