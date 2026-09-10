'use client';

import { useCallback, useState } from 'react';
import { Button, type ButtonProps } from '../../components/ui/button';
import { apiCall } from '../api/apiCall';
import { ErrorMessage } from '../feedback/ErrorMessage';

export interface WorkflowActionProps {
  /** API path, called through `apiCall` (never a raw `fetch`), so CSRF rides along. */
  endpoint: string;
  method?: 'POST' | 'PUT' | 'DELETE';
  /** JSON body. Omit it for an action whose only argument is the session. */
  body?: unknown;
  label: string;
  /** Label while the request is in flight. Defaults to `<label>…`. */
  pendingLabel?: string;
  variant?: ButtonProps['variant'];
  /** Called with the envelope's `data` after a success, before anything is re-rendered. */
  onSuccess?: (data: unknown) => void;
}

/**
 * A single-button server action: press, POST, show pending, surface the failure — platform
 * primitive **F4**.
 *
 * The shape `CrudForm` and `DataTable` do not cover. Neither of them fits an action with no
 * fields and no row: `CrudForm` needs a schema and inputs to render, `DataTable` renders a
 * list. The backlog has roughly a dozen of these (Pay, Cancel, Run payouts, Send for
 * approval, Approve/Decline, Open batch, Raise/Resolve dispute), and E01's consumer is sign
 * out — see `SignOutAction`, which is also where the hard-navigation rule is written down.
 *
 * **It renders a fragment, not a wrapper.** The first consumer puts this button in a header
 * next to other controls, so a layout div would fight its parent; the caller composes it.
 *
 * **`confirm` is deliberately absent.** The spec defers it to the first story that states a
 * contract for it (#24: state the rule and the outcome before the user confirms), which also
 * needs a component the DS has not been asked for yet. A confirmation invented here would be
 * designed by the wrong story.
 */
export function WorkflowAction({
  endpoint,
  method = 'POST',
  body,
  label,
  pendingLabel,
  variant,
  onSuccess,
}: WorkflowActionProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No second in-flight guard beyond `disabled`: a click is a discrete event, so React has
  // committed the disabled state before another one can be delivered, and this component has
  // no keyboard shortcut path around the button the way `CrudForm` does.
  const run = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const result = await apiCall(endpoint, { method, body });
      if (result.ok) {
        onSuccess?.(result.data);
      } else {
        // The envelope's own message. It is server copy written for this failure — a
        // generic "something went wrong" here would discard the only useful thing the
        // server said, including a 429's wait-and-retry advice.
        setError(result.error.message);
      }
    } catch {
      // `apiCall` turns a network failure into an envelope, so reaching here means
      // `onSuccess` threw. Report it rather than leaving an unhandled rejection and a
      // button that silently did nothing.
      setError('We could not complete the request. Try again.');
    } finally {
      setPending(false);
    }
  }, [body, endpoint, method, onSuccess]);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        aria-busy={pending}
        onClick={() => void run()}
      >
        {pending ? pendingLabel ?? `${label}…` : label}
      </Button>
      {error !== null ? <ErrorMessage message={error} /> : null}
    </>
  );
}
