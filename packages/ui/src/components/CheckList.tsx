import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface ChecklistItemData {
  key: string;
  label: string;
  passed: boolean;
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

export interface CheckListProps {
  items: ChecklistItemData[];
  title?: string;
  className?: string;
}

export const CheckList: React.FC<CheckListProps> = ({
  items,
  title = 'Safety & Scrapability Checklist',
  className = '',
}) => {
  return (
    <div className={`border border-zinc-800 bg-zinc-950/60 rounded overflow-hidden font-mono ${className}`}>
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-zinc-900/60 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{title}</span>
        </div>
        <span className="text-[11px] text-zinc-500">
          {items.filter((i) => i.passed).length}/{items.length} passed
        </span>
      </div>

      <div className="divide-y divide-zinc-800/60">
        {items.map((item) => {
          const isPass = item.status === 'pass';
          const isWarn = item.status === 'warn';
          const isFail = item.status === 'fail';

          return (
            <div
              key={item.key}
              className="flex items-start justify-between p-3 gap-3 hover:bg-zinc-900/30 transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0">
                  {isPass && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {isWarn && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  {isFail && <XCircle className="w-4 h-4 text-rose-500" />}
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-200">{item.label}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{item.details}</div>
                </div>
              </div>

              <div className="shrink-0">
                <span
                  className={`inline-block px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-widest rounded ${
                    isPass
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                      : isWarn
                      ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                      : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                  }`}
                >
                  {item.status.toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
