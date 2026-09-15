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
 * What a failed read does to what is already on screen.
 *
 * A read that fails while the consumer is holding loaded data keeps the data: the only reads
 * that can happen in that state are polls, and a transient failure must not erase a
 * transcript somebody is reading. Every other state — the first load, or a `reload()` the user
 * asked for, which sets `loading` first — shows the error, because there is nothing to keep
 * and silence would leave a spinner running forever.
 */
function keepOrFail<T>(
  current: ResourceState<T>,
  path: string,
  error: string,
): ResourceState<T> {
  if (current.status === 'loaded' && current.path === path) return current;
  return { path, status: 'error', error };
}

export interface UseApiResourceOptions<T> {
  /**
   * Re-read the resource every `pollMs` milliseconds. Absent means never.
   *
   * The refresh is **silent**: it does not re-enter the loading state, and a failed refresh
   * does not replace what is already on screen. That is the whole reason this lives here
   * rather than as a `setInterval` calling `reload()` in a component — `reload` is the
   * *user's* refresh and is supposed to show a spinner, while a poll behind a live text
   * session (#26) that blanked the transcript every few seconds would be unusable.
   */
  pollMs?: number;
  /**
   * Keep polling only while this holds for the data in hand. Absent means "for ever".
   *
   * A predicate rather than something the consumer switches off itself, because the answer
   * that decides it arrives *in* the polled response — a text session stops being worth
   * re-reading once the server says it has ended. Evaluated during render, so the interval is
   * derived state here and no consumer needs a `setState` inside an effect to stop it.
   */
  pollWhile?: (data: T | undefined) => boolean;
}

/**
 * Fetch a small private API resource without introducing a cache. Requests are cancelled
 * when the path changes or the consumer unmounts, and mutations can call `reload` after a
 * successful response.
 */
export function useApiResource<T>(
  path: string,
  { pollMs, pollWhile }: UseApiResourceOptions<T> = {},
): ApiResource<T> {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ path, status: 'loading' });

  const reload = useCallback(() => {
    setState({ path, status: 'loading' });
    setRevision((current) => current + 1);
  }, [path]);

  const loaded = state.status === 'loaded' && state.path === path ? state.data : undefined;
  const polling = pollMs !== undefined && (pollWhile === undefined || pollWhile(loaded));

  useEffect(() => {
    if (!polling) return;
    // Bumping the revision alone re-runs the fetch below without touching `state`, so a
    // consumer keeps rendering the data it already has until the answer arrives.
    const timer = setInterval(() => setRevision((current) => current + 1), pollMs);
    return () => clearInterval(timer);
  }, [path, pollMs, polling]);

  useEffect(() => {
    const controller = new AbortController();
    void apiCall<T>(path, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          setState({ path, status: 'loaded', data: result.data });
          return;
        }
        setState((current) => keepOrFail(current, path, result.error.message));
      },
      () => {
        if (controller.signal.aborted) return;
        setState((current) =>
          keepOrFail(current, path, 'We could not load this information. Try again.'));
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
