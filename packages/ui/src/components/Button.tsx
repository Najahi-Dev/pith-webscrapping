import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-mono text-xs uppercase tracking-wider font-semibold transition-all duration-150 rounded border select-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px] focus:outline-none focus:ring-1 focus:ring-emerald-500';

  const sizeStyles = {
    xs: 'h-6 px-2 gap-1 text-[10px]',
    sm: 'h-7 px-2.5 gap-1.5 text-[11px]',
    md: 'h-9 px-3.5 gap-2 text-xs',
    lg: 'h-10 px-4 gap-2 text-sm',
  }[size];

  const variantStyles = {
    primary:
      'bg-emerald-500 hover:bg-emerald-600 text-zinc-950 border-emerald-400 dark:border-emerald-600 font-bold shadow-sm',
    secondary:
      'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-700',
    outline:
      'bg-transparent hover:bg-zinc-800/40 text-zinc-300 border-zinc-700 dark:border-zinc-800 hover:text-white',
    danger:
      'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30 hover:border-rose-500/50',
    ghost:
      'bg-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-100 border-transparent',
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
