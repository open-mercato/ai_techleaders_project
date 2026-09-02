import { cn } from '../../lib/utils';

/** The sanctioned error renderer — pages compose this instead of bespoke error text. */
export function ErrorMessage({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <p role="alert" className={cn('text-sm text-destructive', className)}>
      {message}
    </p>
  );
}
