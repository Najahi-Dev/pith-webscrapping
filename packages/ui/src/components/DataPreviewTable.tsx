import React, { useState } from 'react';
import { Download, Search, ToggleLeft, ToggleRight, FileSpreadsheet, FileJson, FileCode, Check } from 'lucide-react';
import { Button } from './Button';

export interface DataPreviewTableProps {
  rows: Record<string, any>[];
  rawRows?: Record<string, any>[];
  columns: string[];
  title?: string;
  onExport?: (format: 'csv' | 'json' | 'xlsx') => void;
  className?: string;
}

export const DataPreviewTable: React.FC<DataPreviewTableProps> = ({
  rows,
  rawRows,
  columns,
  title = 'Extracted Dataset',
  onExport,
  className = '',
}) => {
  const [showCleaned, setShowCleaned] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const currentDataset = showCleaned || !rawRows ? rows : rawRows;

  const filteredRows = currentDataset.filter((row) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return Object.values(row).some((val) => {
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val).toLowerCase().includes(q);
      }
      return String(val || '').toLowerCase().includes(q);
    });
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const renderCellContent = (val: any) => {
    if (val === null || val === undefined) {
      return <span className="text-zinc-600 italic">null</span>;
    }
    if (typeof val === 'object') {
      if ('amount' in val && 'currency' in val) {
        return (
          <span className="text-emerald-400 font-semibold">
            {val.currency} {val.amount}
          </span>
        );
      }
      if ('url' in val && 'text' in val) {
        return (
          <div className="truncate max-w-xs">
            <span className="text-zinc-200">{val.text}</span>
            <span className="text-zinc-500 text-[10px] block truncate">{val.url}</span>
          </div>
        );
      }
      return <code className="text-zinc-400 text-[10px]">{JSON.stringify(val)}</code>;
    }
    const str = String(val);
    if (str.startsWith('http://') || str.startsWith('https://')) {
      return (
        <a
          href={str}
          target="_blank"
          rel="noreferrer"
          className="text-cyan-400 hover:underline truncate block max-w-xs"
        >
          {str}
        </a>
      );
    }
    return <span className="text-zinc-200 truncate block max-w-xs">{str}</span>;
  };

  return (
    <div className={`border border-zinc-800 bg-zinc-950 rounded overflow-hidden font-mono ${className}`}>
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-900/60 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-100">{title}</span>
          <span className="px-2 py-0.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-400">
            {filteredRows.length} rows ({columns.length} columns)
          </span>

          {rawRows && (
            <button
              type="button"
              onClick={() => setShowCleaned(!showCleaned)}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 rounded text-zinc-300 transition-colors"
            >
              {showCleaned ? (
                <ToggleRight className="w-4 h-4 text-emerald-400" />
              ) : (
                <ToggleLeft className="w-4 h-4 text-zinc-500" />
              )}
              <span>{showCleaned ? 'Cleaned Mode' : 'Raw Mode'}</span>
            </button>
          )}
        </div>

        {/* Search & Export Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Filter results..."
              value={filterQuery}
              onChange={(e) => {
                setFilterQuery(e.target.value);
                setPage(1);
              }}
              className="h-7.5 pl-7 pr-2.5 text-xs bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 border border-zinc-700/80 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {onExport && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="xs" onClick={() => onExport('csv')} icon={<Download className="w-3 h-3" />}>
                CSV
              </Button>
              <Button variant="outline" size="xs" onClick={() => onExport('json')} icon={<FileJson className="w-3 h-3" />}>
                JSON
              </Button>
              <Button variant="outline" size="xs" onClick={() => onExport('xlsx')} icon={<FileSpreadsheet className="w-3 h-3" />}>
                XLSX
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Table grid */}
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-zinc-900/90 sticky top-0 border-b border-zinc-800 z-10">
            <tr>
              <th className="p-2.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider w-12 text-center border-r border-zinc-800/60">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="p-2.5 text-[11px] font-semibold text-zinc-300 uppercase tracking-wider border-r border-zinc-800/60 last:border-r-0"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40">
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-8 text-center text-zinc-500 italic">
                  No matching records found
                </td>
              </tr>
            ) : (
              pagedRows.map((row, idx) => {
                const rowIndex = (page - 1) * pageSize + idx + 1;
                return (
                  <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-2.5 text-zinc-500 text-center font-mono text-[11px] border-r border-zinc-800/60">
                      {rowIndex}
                    </td>
                    {columns.map((col) => (
                      <td key={col} className="p-2.5 border-r border-zinc-800/60 last:border-r-0">
                        {renderCellContent(row[col])}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-2.5 bg-zinc-900/60 border-t border-zinc-800 text-xs">
          <span className="text-zinc-500">
            Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filteredRows.length)} of{' '}
            {filteredRows.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="px-2 text-zinc-400 font-semibold">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="xs"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
