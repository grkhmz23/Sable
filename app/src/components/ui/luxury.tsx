'use client';

import * as React from 'react';

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function truncateAddress(value: string, head = 8, tail = 8) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
}

export function GlassPanel({ children, className, highlight = false }: GlassPanelProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border backdrop-blur-2xl',
        'bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]',
        highlight
          ? 'border-[rgba(214,190,112,0.25)] shadow-[0_12px_60px_rgba(191,149,63,0.10)]'
          : 'border-white/8 shadow-[0_16px_60px_rgba(0,0,0,0.35)]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(252,246,186,0.06),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_55%)]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface LuxuryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
  fullWidth?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function LuxuryButton({
  children,
  className,
  variant = 'primary',
  isLoading = false,
  disabled,
  fullWidth = false,
  leading,
  trailing,
  ...props
}: LuxuryButtonProps) {
  const base =
    'group relative inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-45';
  const styles: Record<ButtonVariant, string> = {
    primary:
      'text-black bg-[linear-gradient(90deg,#BF953F_0%,#FCF6BA_50%,#B38728_100%)] shadow-[0_0_30px_rgba(191,149,63,0.22)] hover:scale-[1.01] hover:shadow-[0_0_42px_rgba(191,149,63,0.35)]',
    secondary:
      'text-zinc-100 border border-white/12 bg-white/5 hover:bg-white/9 hover:border-white/20',
    ghost:
      'text-zinc-400 hover:text-zinc-100 hover:bg-white/5',
    danger:
      'text-rose-100 border border-rose-400/20 bg-rose-500/10 hover:bg-rose-500/15',
  };

  return (
    <button
      className={cn(base, styles[variant], fullWidth && 'w-full', className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Spinner className="h-3.5 w-3.5" /> : leading}
      <span>{children}</span>
      {!isLoading ? trailing : null}
      {variant === 'primary' ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 [mask-image:linear-gradient(120deg,transparent_0%,white_50%,transparent_100%)] bg-white/45 transition-opacity duration-500 group-hover:opacity-100"
        />
      ) : null}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-r-transparent',
        className
      )}
      aria-hidden
    />
  );
}

interface FieldLabelProps {
  children: React.ReactNode;
  hint?: React.ReactNode;
}

export function FieldLabel({ children, hint }: FieldLabelProps) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        {children}
      </label>
      {hint ? <span className="text-[10px] text-zinc-600">{hint}</span> : null}
    </div>
  );
}

type BaseFieldProps = {
  className?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
};

export function LuxuryInput({
  className,
  label,
  hint,
  error,
  ...props
}: BaseFieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      {label ? <FieldLabel hint={hint}>{label}</FieldLabel> : null}
      <input
        className={cn(
          'w-full rounded-xl border bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600',
          'border-white/10 focus:border-[rgba(214,190,112,0.32)] focus:bg-white/[0.04] focus:outline-none',
          'font-sans transition-colors',
          error && 'border-rose-400/35',
          className
        )}
        {...props}
      />
      {error ? <p className="mt-1 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

export function LuxuryTextarea({
  className,
  label,
  hint,
  error,
  ...props
}: BaseFieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      {label ? <FieldLabel hint={hint}>{label}</FieldLabel> : null}
      <textarea
        className={cn(
          'w-full rounded-xl border bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600',
          'border-white/10 focus:border-[rgba(214,190,112,0.32)] focus:bg-white/[0.04] focus:outline-none',
          'font-mono transition-colors resize-y',
          error && 'border-rose-400/35',
          className
        )}
        {...props}
      />
      {error ? <p className="mt-1 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

interface PillProps {
  children: React.ReactNode;
  tone?: 'default' | 'amber' | 'green' | 'red';
  className?: string;
}

export function Pill({ children, tone = 'default', className }: PillProps) {
  const tones = {
    default: 'border-white/10 bg-white/5 text-zinc-300',
    amber: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
    green: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    red: 'border-rose-300/20 bg-rose-300/10 text-rose-100',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

interface TimelineItemProps {
  label: string;
  active?: boolean;
  done?: boolean;
  warning?: boolean;
  last?: boolean;
}

export function TimelineItem({
  label,
  active = false,
  done = false,
  warning = false,
  last = false,
}: TimelineItemProps) {
  return (
    <div className="relative flex items-center gap-3 pl-1">
      {!last ? (
        <span
          aria-hidden
          className={cn(
            'absolute left-[8px] top-5 h-[22px] w-px',
            done ? 'bg-amber-200/30' : 'bg-white/8'
          )}
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          'relative z-10 grid h-4 w-4 place-items-center rounded-full border bg-black',
          done && 'border-amber-200/45',
          active && !warning && 'border-amber-300 shadow-[0_0_14px_rgba(252,246,186,0.35)]',
          active && warning && 'border-rose-300 shadow-[0_0_14px_rgba(251,113,133,0.28)]',
          !active && !done && 'border-white/12'
        )}
      >
        {done ? (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-100" />
        ) : active ? (
          <span
            className={cn(
              'h-1.5 w-1.5 animate-pulse rounded-full',
              warning ? 'bg-rose-300' : 'bg-amber-100'
            )}
          />
        ) : null}
      </span>
      <span
        className={cn(
          'text-xs',
          active ? (warning ? 'text-rose-100' : 'text-amber-100') : done ? 'text-zinc-300' : 'text-zinc-600'
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-[10px] uppercase tracking-[0.26em] text-zinc-500">{eyebrow}</p>
        ) : null}
        <h2 className="text-xl text-white md:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm text-zinc-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
