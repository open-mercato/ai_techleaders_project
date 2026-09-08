import { cn } from '../../lib/utils';

/** The sanctioned loading renderer — pages compose this instead of a bespoke spinner. */
export function LoadingMessage({
  message = 'Loading…',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <p role="status" className={cn('dm-loading-message', className)}>
      <span className="dm-loading-indicator" aria-hidden="true" />
      {message}
    </p>
  );
}
