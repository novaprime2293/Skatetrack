import { type ReactNode, type ButtonHTMLAttributes, useEffect } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={clsx(
        'font-semibold uppercase tracking-wider rounded-full transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-5 py-2.5 text-sm',
        size === 'lg' && 'px-7 py-3.5 text-base',
        variant === 'primary' && 'bg-neon-green text-bg-base hover:neon-glow-green',
        variant === 'secondary' && 'bg-bg-card text-fg-primary border border-border hover:bg-bg-card-hover',
        variant === 'danger' && 'bg-neon-pink text-bg-base hover:neon-glow-pink',
        variant === 'ghost' && 'text-fg-secondary hover:text-fg-primary hover:bg-bg-card',
        className
      )}
    >
      {children}
    </button>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-bg-card border border-border rounded-2xl p-4',
        onClick && 'cursor-pointer hover:bg-bg-card-hover transition-colors',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="px-4 pt-6 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-fg-secondary mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-16 h-16 rounded-full bg-bg-card border border-border flex items-center justify-center mb-4 text-fg-muted">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-fg-secondary mt-2 max-w-sm">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Pill({ children, color = 'green' }: { children: ReactNode; color?: 'green' | 'pink' | 'yellow' | 'cyan' | 'orange' | 'muted' }) {
  const cls = {
    green: 'bg-neon-green/10 text-neon-green border-neon-green/30',
    pink: 'bg-neon-pink/10 text-neon-pink border-neon-pink/30',
    yellow: 'bg-neon-yellow/10 text-neon-yellow border-neon-yellow/30',
    cyan: 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30',
    orange: 'bg-neon-orange/10 text-neon-orange border-neon-orange/30',
    muted: 'bg-bg-card text-fg-muted border-border',
  }[color];
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', cls)}>
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-bg-elevated border border-border rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-bold">{title}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-card text-fg-secondary hover:text-fg-primary" aria-label="Close">✕</button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-fg-primary placeholder-fg-muted',
        'focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/50',
        props.className
      )}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        'w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-fg-primary placeholder-fg-muted',
        'focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/50',
        props.className
      )}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wider text-fg-muted mb-1.5">{children}</label>;
}
