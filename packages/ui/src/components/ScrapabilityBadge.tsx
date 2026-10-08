import React from 'react';
import { Gauge, Cpu, Check, AlertCircle } from 'lucide-react';

export interface ScrapabilityBadgeProps {
  score: number;
  level: 'easy' | 'medium' | 'hard';
  recommendedMethod: 'http' | 'playwright';
  activeMethod?: 'http' | 'playwright';
  reasons: string[];
  className?: string;
}

export const ScrapabilityBadge: React.FC<ScrapabilityBadgeProps> = ({
  score,
  level,
  recommendedMethod,
  activeMethod,
  reasons,
  className = '',
}) => {
  const levelTheme = {
    easy: {
      bg: 'bg-emerald-950/30',
      border: 'border-emerald-800/50',
      text: 'text-emerald-400',
      bar: 'bg-emerald-500',
      tag: 'EASY TO SCRAPE',
    },
    medium: {
      bg: 'bg-amber-950/30',
      border: 'border-amber-800/50',
      text: 'text-amber-400',
      bar: 'bg-amber-500',
      tag: 'MODERATE COMPLEXITY',
    },
    hard: {
      bg: 'bg-rose-950/30',
      border: 'border-rose-800/50',
      text: 'text-rose-400',
      bar: 'bg-rose-500',
      tag: 'RESTRICTED / BLOCKED',
    },
  }[level];

  return (
    <div className={`border ${levelTheme.border} ${levelTheme.bg} rounded p-4 font-mono space-y-3.5 ${className}`}>
      {/* Top Main Score Block */}
      <div className="flex items-center gap-3.5">
        <div className="flex items-center justify-center w-12 h-12 rounded bg-zinc-950 border border-zinc-800 shrink-0 shadow-inner">
          <span className={`text-xl font-bold tracking-tight ${levelTheme.text}`}>{score}</span>
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider truncate ${levelTheme.text}`}>
              {levelTheme.tag}
            </span>
            <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold bg-zinc-900 text-zinc-300 rounded border border-zinc-800 shrink-0">
              {score}/100
            </span>
          </div>

          {/* Progress Bar under the title */}
          <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800/80">
            <div
              className={`h-full ${levelTheme.bar} transition-all duration-500 rounded-full`}
              style={{ width: `${Math.max(5, score)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Engine Status Strip */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800/60 text-xs">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 bg-zinc-950/60 px-2 py-1 rounded border border-zinc-800">
          <Cpu className="w-3 h-3 text-zinc-500" />
          <span>Rec:</span>
          <span className="font-semibold text-zinc-200 uppercase">{recommendedMethod}</span>
        </div>

        {activeMethod && (
          <div
            className={`px-2 py-1 rounded text-[11px] font-bold border uppercase flex items-center gap-1 ${
              activeMethod === 'playwright'
                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800'
                : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            <span>Active: {activeMethod === 'playwright' ? 'Playwright JS' : 'Fast HTTP'}</span>
          </div>
        )}
      </div>

      {/* Detection Insights List */}
      <div className="pt-2 border-t border-zinc-800/60 space-y-1.5">
        <div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
          Detection Insights:
        </div>
        <div className="space-y-1">
          {reasons.slice(0, 4).map((reason, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300 leading-relaxed">
              <span className="text-zinc-600 mt-0.5">•</span>
              <span>{reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
