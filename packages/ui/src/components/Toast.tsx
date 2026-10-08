import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Info,
  Loader2,
  X,
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: React.ReactNode;
  duration?: number; // ms, default 4000. 0 = persistent
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export function ToastCard({ toast, onDismiss }: ToastCardProps) {
  const [progress, setProgress] = useState(100);
  const duration = toast.duration ?? (toast.type === 'loading' ? 0 : 4000);
  const isPersistent = duration === 0;

  useEffect(() => {
    if (isPersistent) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast.id, duration, isPersistent, onDismiss]);

  const typeStyles = {
    success: {
      border: 'border-emerald-500/40 bg-zinc-950/95 shadow-emerald-950/20',
      iconColor: 'text-emerald-400',
      progressBar: 'bg-emerald-500',
      icon: <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />,
    },
    error: {
      border: 'border-rose-500/40 bg-zinc-950/95 shadow-rose-950/20',
      iconColor: 'text-rose-400',
      progressBar: 'bg-rose-500',
      icon: <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />,
    },
    warning: {
      border: 'border-amber-500/40 bg-zinc-950/95 shadow-amber-950/20',
      iconColor: 'text-amber-400',
      progressBar: 'bg-amber-500',
      icon: <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />,
    },
    info: {
      border: 'border-sky-500/40 bg-zinc-950/95 shadow-sky-950/20',
      iconColor: 'text-sky-400',
      progressBar: 'bg-sky-500',
      icon: <Info className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />,
    },
    loading: {
      border: 'border-emerald-500/40 bg-zinc-950/95 shadow-emerald-950/20',
      iconColor: 'text-emerald-400',
      progressBar: 'bg-emerald-500 animate-pulse',
      icon: <Loader2 className="w-4 h-4 shrink-0 text-emerald-400 animate-spin mt-0.5" />,
    },
  }[toast.type];

  return (
    <div
      role="alert"
      className={`relative w-full max-w-sm rounded-lg border ${typeStyles.border} p-3.5 shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-200 animate-toast font-mono`}
    >
      <div className="flex items-start gap-3">
        {typeStyles.icon}
        <div className="flex-1 min-w-0 pr-1">
          <h4 className="text-xs font-bold text-zinc-100 tracking-tight leading-snug">
            {toast.title}
          </h4>
          {toast.description && (
            <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed break-words font-normal">
              {toast.description}
            </div>
          )}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="mt-2 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-2 flex items-center gap-1"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
          title="Dismiss toast"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Auto-dismiss Countdown Progress Bar */}
      {!isPersistent && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 overflow-hidden">
          <div
            className={`h-full ${typeStyles.progressBar} transition-all duration-75`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  position?: 'bottom-right' | 'top-right' | 'bottom-center';
}

export function ToastContainer({
  toasts,
  onDismiss,
  position = 'bottom-right',
}: ToastContainerProps) {
  if (toasts.length === 0) return null;

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4 items-end',
    'top-right': 'top-4 right-4 items-end',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
  }[position];

  return (
    <div
      aria-live="polite"
      className={`fixed ${positionClasses} z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-full px-4 sm:px-0`}
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
