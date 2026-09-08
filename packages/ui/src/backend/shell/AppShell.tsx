'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface AppShellProps {
  nav: ReactNode;
  user: { displayName: string };
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Presentational chrome; the application supplies authorized links and actions. */
export function AppShell({ nav, user, actions, children, className }: AppShellProps) {
  const contentId = useId();
  return <div className="dm-shell-container"><div className={cn('dm-app-shell', className)}>
    <a className="dm-skip-link" href={`#${contentId}`}>Skip to content</a>
    <aside className="dm-app-sidebar">
      <div className="dm-app-brand">DevMentor<span>Workspace</span></div>
      <nav aria-label="Workspace navigation" className="dm-app-nav">{nav}</nav>
      <div className="dm-app-user"><span className="dm-app-user-label">Signed in as</span><strong>{user.displayName}</strong></div>
    </aside>
    <div className="dm-app-workspace">
      <header className="dm-app-topbar"><span>Your DevMentor workspace</span><div className="dm-app-actions">{actions}</div></header>
      <main id={contentId} tabIndex={-1} className="dm-app-main">{children}</main>
    </div>
  </div></div>;
}
