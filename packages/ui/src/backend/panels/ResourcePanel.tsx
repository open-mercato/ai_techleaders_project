import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import type { ApiResource } from '../api/useApiResource';
import { EmptyState } from '../feedback/EmptyState';
import { ErrorMessage } from '../feedback/ErrorMessage';
import { LoadingMessage } from '../feedback/LoadingMessage';

export interface ResourcePanelProps<T> {
  resource: ApiResource<T>;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  loadingMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

/** Render one non-table resource through the shared loading, error and empty states. */
export function ResourcePanel<T>({
  resource,
  children,
  isEmpty = () => false,
  loadingMessage,
  emptyTitle = 'Nothing to show yet',
  emptyDescription,
  emptyAction,
}: ResourcePanelProps<T>) {
  if (resource.loading) {
    return <LoadingMessage message={loadingMessage} />;
  }
  if (resource.error !== undefined) {
    return <ErrorMessage message={resource.error} action={
      <Button type="button" variant="outline" onClick={resource.reload}>Try again</Button>
    } />;
  }
  if (resource.data === undefined || isEmpty(resource.data)) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }
  return children(resource.data);
}
