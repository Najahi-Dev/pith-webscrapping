import React, { useState } from 'react';
import { Table, Layers, Link as LinkIcon, Image as ImageIcon, FileText, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { Button } from './Button';

export interface CategoryCardProps {
  id: string;
  name: string;
  description: string;
  count: number;
  fields: string[];
  sampleRows: Record<string, any>[];
  selector?: string;
  categoryType: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  id,
  name,
  description,
  count,
  fields,
  sampleRows,
  selector,
  categoryType,
  selected = false,
  onSelect,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false);

  const getIcon = () => {
    switch (categoryType) {
      case 'table':
        return <Table className="w-4 h-4 text-emerald-400" />;
      case 'repeating_items':
        return <Layers className="w-4 h-4 text-cyan-400" />;
      case 'links':
        return <LinkIcon className="w-4 h-4 text-blue-400" />;
      case 'images':
        return <ImageIcon className="w-4 h-4 text-purple-400" />;
      default:
        return <FileText className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div
      className={`border rounded font-mono transition-all duration-150 ${
        selected
          ? 'border-emerald-500 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
      } ${className}`}
    >
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-zinc-800/80 border border-zinc-700">{getIcon()}</div>
            <div>
              <div className="text-xs font-bold text-zinc-100">{name}</div>
              <div className="text-[11px] text-zinc-400">{description}</div>
            </div>
          </div>

          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700 rounded shrink-0">
            {count} rows
          </span>
        </div>

        {/* Field chips */}
        <div className="flex flex-wrap gap-1">
          {fields.slice(0, 6).map((f) => (
            <span
              key={f}
              className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800/90 text-zinc-300 border border-zinc-700/60 rounded"
            >
              {f}
            </span>
          ))}
          {fields.length > 6 && (
            <span className="px-1.5 py-0.5 text-[10px] text-zinc-500">+{fields.length - 6} more</span>
          )}
        </div>

        {selector && (
          <div className="text-[10px] text-zinc-500 font-mono truncate">
            Selector: <code className="text-zinc-400">{selector}</code>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <span>{expanded ? 'Hide Samples' : 'View Samples'}</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {onSelect && (
            <Button
              variant={selected ? 'primary' : 'outline'}
              size="xs"
              onClick={() => onSelect(id)}
              icon={selected ? <Check className="w-3 h-3" /> : undefined}
            >
              {selected ? 'Selected' : 'Select'}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Sample Rows Preview */}
      {expanded && sampleRows.length > 0 && (
        <div className="p-3 bg-zinc-950 border-t border-zinc-800 space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
            Preview (3 Sample Rows):
          </div>
          <div className="space-y-1.5 overflow-x-auto">
            {sampleRows.slice(0, 3).map((row, idx) => (
              <pre
                key={idx}
                className="p-2 text-[10.5px] bg-zinc-900 border border-zinc-800 rounded text-emerald-400 overflow-x-auto"
              >
                {JSON.stringify(row, null, 2)}
              </pre>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
