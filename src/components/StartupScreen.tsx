import { useState, type ReactNode } from 'react';

export function StartupScreen({ title, message, failed = false, children }: {
  title: string;
  message: string;
  failed?: boolean;
  children?: ReactNode;
}) {
  const [theme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = window.localStorage.getItem('smartliving-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  return (
    <main className="sl-startup" data-theme={theme}>
      <section className="sl-startup-card">
        <img className="sl-startup-logo" src="/brand/square_icon.png" alt="" width={84} height={88} />
        <p className="sl-startup-brand">S-Mart Living</p>
        <h1>{title}</h1>
        <p className="sl-startup-message" role={failed ? 'alert' : 'status'}>{message}</p>
        {!failed && <div className="sl-startup-progress" aria-hidden="true" />}
        {children}
      </section>
    </main>
  );
}
