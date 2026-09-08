import type { ReactNode } from 'react';

export interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Authentication presentation only; forms and OAuth links come from the host. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return <main className="dm-auth-layout">
    <div className="dm-auth-brand">DevMentor</div>
    <section className="dm-auth-panel">
      <h1>{title}</h1><p className="dm-auth-description">{description}</p>
      <div className="dm-auth-content">{children}</div>
      <footer>{footer}</footer>
    </section>
    <p className="dm-auth-tagline">Text mentoring for developers.</p>
  </main>;
}
