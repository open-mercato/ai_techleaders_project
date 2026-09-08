import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

/** The sanctioned error renderer — pages compose this instead of bespoke error text. */
export function ErrorMessage({
  message,
  className,
  action,
}: {
  message: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className={cn('dm-error-message', className)}>
      <p>{message}</p>
      {action}
    </div>
  );
}
