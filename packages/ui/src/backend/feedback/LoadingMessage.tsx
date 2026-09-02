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
    <p role="status" className={cn('text-sm text-muted-foreground', className)}>
      {message}
    </p>
  );
}
