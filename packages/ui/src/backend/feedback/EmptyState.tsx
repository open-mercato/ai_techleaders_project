import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** The sanctioned empty-state renderer for lists and collections. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  tone = 'neutral',
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'dm-empty-state',
        className,
      )}
      data-tone={tone}
    >
      {icon ? <span className="dm-empty-icon" aria-hidden="true">{icon}</span> : null}
      <p className="dm-empty-title">{title}</p>
      {description ? <p className="dm-empty-description">{description}</p> : null}
      {action}
    </div>
  );
}
