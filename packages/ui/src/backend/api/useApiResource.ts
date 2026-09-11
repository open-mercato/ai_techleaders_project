'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiCall } from './apiCall';

type ResourceState<T> =
  | { path: string; status: 'loading' }
  | { path: string; status: 'loaded'; data: T }
  | { path: string; status: 'error'; error: string };

export interface ApiResource<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

/**
 * Fetch a small private API resource without introducing a cache. Requests are cancelled
 * when the path changes or the consumer unmounts, and mutations can call `reload` after a
 * successful response.
 */
export function useApiResource<T>(path: string): ApiResource<T> {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ path, status: 'loading' });

  const reload = useCallback(() => {
    setState({ path, status: 'loading' });
    setRevision((current) => current + 1);
  }, [path]);

  useEffect(() => {
    const controller = new AbortController();
    void apiCall<T>(path, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        setState(result.ok
          ? { path, status: 'loaded', data: result.data }
          : { path, status: 'error', error: result.error.message });
      },
      () => {
        if (controller.signal.aborted) return;
        setState({
          path,
          status: 'error',
          error: 'We could not load this information. Try again.',
        });
      },
    );
    return () => controller.abort();
  }, [path, revision]);

  if (state.path !== path || state.status === 'loading') {
    return { data: undefined, loading: true, error: undefined, reload };
  }
  if (state.status === 'error') {
    return { data: undefined, loading: false, error: state.error, reload };
  }
  return { data: state.data, loading: false, error: undefined, reload };
}
