import React, { useState } from 'react';
import { PlusCircle, MinusCircle, Edit3, Bell, ArrowRight } from 'lucide-react';

export interface ModifiedField {
  previous: any;
  current: any;
}

export interface ModifiedRowItem {
  key: string;
  row: Record<string, any>;
  changes: Record<string, ModifiedField>;
}

export interface DiffViewerProps {
  addedRows: Record<string, any>[];
  removedRows: Record<string, any>[];
  modifiedRows: ModifiedRowItem[];
  alerts?: string[];
  keyField?: string;
  className?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  addedRows = [],
  removedRows = [],
  modifiedRows = [],
  alerts = [],
  keyField = 'auto',
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'modified' | 'added' | 'removed'>('modified');

  const totalChanges = addedRows.length + removedRows.length + modifiedRows.length;

  return (
    <div className={`border border-zinc-800 bg-zinc-950 rounded font-mono overflow-hidden ${className}`}>
      {/* Alert Banner if alerts were triggered */}
      {alerts.length > 0 && (
        <div className="p-3 bg-amber-950/40 border-b border-amber-900/60 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <Bell className="w-3.5 h-3.5" />
            <span>Alerts Triggered ({alerts.length})</span>
          </div>
          <div className="space-y-1">
            {alerts.map((a, i) => (
              <div key={i} className="text-xs text-amber-200">
                • {a}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between p-3 bg-zinc-900/80 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('modified')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded font-semibold transition-all ${
              activeTab === 'modified'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Edit3 className="w-3 h-3 text-amber-400" />
            <span>Modified ({modifiedRows.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('added')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded font-semibold transition-all ${
              activeTab === 'added'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <PlusCircle className="w-3 h-3 text-emerald-400" />
            <span>Added ({addedRows.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('removed')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded font-semibold transition-all ${
              activeTab === 'removed'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MinusCircle className="w-3 h-3 text-rose-400" />
            <span>Removed ({removedRows.length})</span>
          </button>
        </div>

        <span className="text-[11px] text-zinc-500">Key Field: {keyField}</span>
      </div>

      {/* Tab Content */}
      <div className="p-4 divide-y divide-zinc-800/60 max-h-96 overflow-y-auto">
        {activeTab === 'modified' && (
          <div>
            {modifiedRows.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs italic">No modified records in this run</div>
            ) : (
              modifiedRows.map((item, idx) => (
                <div key={idx} className="py-3 space-y-2 first:pt-0 last:pb-0">
                  <div className="text-xs font-bold text-zinc-200 truncate">
                    Row Identifier: <code className="text-cyan-400">{item.key}</code>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(item.changes).map(([fName, change]) => (
                      <div
                        key={fName}
                        className="p-2 bg-zinc-900 border border-zinc-800 rounded text-xs space-y-1"
                      >
                        <span className="text-[10px] uppercase font-bold text-zinc-400">{fName}:</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-1.5 py-0.5 bg-rose-950 text-rose-300 rounded line-through truncate max-w-[140px]">
                            {typeof change.previous === 'object' ? JSON.stringify(change.previous) : String(change.previous)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-300 rounded font-semibold truncate max-w-[140px]">
                            {typeof change.current === 'object' ? JSON.stringify(change.current) : String(change.current)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'added' && (
          <div>
            {addedRows.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs italic">No new records added</div>
            ) : (
              addedRows.map((r, idx) => (
                <div key={idx} className="py-2.5 bg-emerald-950/10 border-b border-zinc-800 last:border-b-0">
                  <pre className="text-[11px] text-emerald-400 overflow-x-auto">{JSON.stringify(r, null, 2)}</pre>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'removed' && (
          <div>
            {removedRows.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs italic">No records removed</div>
            ) : (
              removedRows.map((r, idx) => (
                <div key={idx} className="py-2.5 bg-rose-950/10 border-b border-zinc-800 last:border-b-0">
                  <pre className="text-[11px] text-rose-400 line-through overflow-x-auto">
                    {JSON.stringify(r, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
