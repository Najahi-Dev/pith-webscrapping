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
      bg: 'bg-emerald-950/40',
      border: 'border-emerald-800/60',
      text: 'text-emerald-400',
      bar: 'bg-emerald-500',
      tag: 'EASY TO SCRAPE',
    },
    medium: {
      bg: 'bg-amber-950/40',
      border: 'border-amber-800/60',
      text: 'text-amber-400',
      bar: 'bg-amber-500',
      tag: 'MODERATE COMPLEXITY',
    },
    hard: {
      bg: 'bg-rose-950/40',
      border: 'border-rose-800/60',
      text: 'text-rose-400',
      bar: 'bg-rose-500',
      tag: 'RESTRICTED / BLOCKED',
    },
  }[level];

  return (
    <div className={`border ${levelTheme.border} ${levelTheme.bg} rounded p-4 font-mono ${className}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded bg-zinc-900 border border-zinc-700">
            <span className={`text-xl font-bold ${levelTheme.text}`}>{score}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${levelTheme.text}`}>
                {levelTheme.tag}
              </span>
              <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold bg-zinc-800 text-zinc-300 rounded border border-zinc-700">
                Score {score}/100
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-zinc-400">
                <Cpu className="w-3.5 h-3.5 text-zinc-500" />
                Rec: <span className="font-semibold text-zinc-300 uppercase">{recommendedMethod}</span>
              </span>
              {activeMethod && (
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border uppercase ${
                  activeMethod === 'playwright'
                    ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800'
                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                }`}>
                  Active: {activeMethod === 'playwright' ? 'Playwright JS' : 'Fast HTTP'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Meter bar */}
        <div className="w-full md:w-36 bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
          <div
            className={`h-full ${levelTheme.bar} transition-all duration-500`}
            style={{ width: `${Math.max(5, score)}%` }}
          />
        </div>
      </div>

      <div className="pt-3 space-y-1">
        <div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider mb-1.5">
          Detection Insights:
        </div>
        {reasons.slice(0, 4).map((reason, idx) => (
          <div key={idx} className="flex items-start gap-1.5 text-xs text-zinc-300">
            <span className="text-zinc-600 mt-0.5">•</span>
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
