import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from './Button';

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'primary';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  details?: string[];
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  details,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const variantConfig = {
    danger: {
      border: 'border-rose-500/50 shadow-rose-950/40',
      iconBg: 'bg-rose-950/80 border-rose-800/60 text-rose-400',
      icon: <AlertOctagon className="w-5 h-5" />,
      confirmBtnVariant: 'danger' as const,
      confirmBtnClass: 'bg-rose-600 hover:bg-rose-500 text-white font-bold',
      headerGlow: 'from-rose-500/10 via-transparent to-transparent',
    },
    warning: {
      border: 'border-amber-500/50 shadow-amber-950/40',
      iconBg: 'bg-amber-950/80 border-amber-800/60 text-amber-400',
      icon: <AlertTriangle className="w-5 h-5" />,
      confirmBtnVariant: 'primary' as const,
      confirmBtnClass: 'bg-amber-600 hover:bg-amber-500 text-white font-bold',
      headerGlow: 'from-amber-500/10 via-transparent to-transparent',
    },
    info: {
      border: 'border-sky-500/50 shadow-sky-950/40',
      iconBg: 'bg-sky-950/80 border-sky-800/60 text-sky-400',
      icon: <HelpCircle className="w-5 h-5" />,
      confirmBtnVariant: 'primary' as const,
      confirmBtnClass: 'bg-sky-600 hover:bg-sky-500 text-white font-bold',
      headerGlow: 'from-sky-500/10 via-transparent to-transparent',
    },
    primary: {
      border: 'border-emerald-500/50 shadow-emerald-950/40',
      iconBg: 'bg-emerald-950/80 border-emerald-800/60 text-emerald-400',
      icon: <CheckCircle2 className="w-5 h-5" />,
      confirmBtnVariant: 'primary' as const,
      confirmBtnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold',
      headerGlow: 'from-emerald-500/10 via-transparent to-transparent',
    },
  }[variant];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-mono"
    >
      <div
        className={`relative w-full max-w-lg rounded-xl bg-zinc-950 border ${variantConfig.border} shadow-2xl overflow-hidden animate-modal transition-all`}
      >
        {/* Subtle Ambient Top Accent Glow */}
        <div
          className={`absolute top-0 left-0 right-0 h-24 bg-gradient-to-b ${variantConfig.headerGlow} pointer-events-none`}
        />

        {/* Header */}
        <div className="relative p-5 pb-4 flex items-start justify-between gap-4 border-b border-zinc-850">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 shadow-inner ${variantConfig.iconBg}`}
            >
              {variantConfig.icon}
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100 tracking-tight leading-snug">
                {title}
              </h3>
              <div className="text-[11px] text-zinc-500 mt-0.5">Confirmation Required</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="relative p-5 space-y-3.5">
          <div className="text-xs text-zinc-300 leading-relaxed break-words font-normal">
            {description}
          </div>

          {details && details.length > 0 && (
            <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-1.5 text-xs text-zinc-400">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Notice:
              </div>
              <ul className="space-y-1 list-disc list-inside text-[11px] text-zinc-300">
                {details.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="relative p-4 bg-zinc-950/80 border-t border-zinc-850 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
            className="font-mono text-xs h-9 px-4 border-zinc-700 text-zinc-300 hover:bg-zinc-850"
          >
            {cancelText}
          </Button>

          <Button
            ref={confirmBtnRef}
            type="button"
            variant={variantConfig.confirmBtnVariant}
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
            className={`font-mono text-xs h-9 px-4 gap-2 ${variantConfig.confirmBtnClass}`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
