'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Play,
  Pause,
  XCircle,
  RotateCcw,
  Download,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  FileCode,
  ExternalLink,
  Search
} from 'lucide-react';
import { Button } from '@pith/ui';
import { SiteResponse, SitePageType, SitePageItem, pithApi } from '@/lib/api';

interface SiteCrawlDashboardProps {
  site: SiteResponse;
  onRefresh: () => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
  onRetryFailed: () => Promise<void>;
  onReset: () => void;
}

export function SiteCrawlDashboard({
  site,
  onRefresh,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onReset
}: SiteCrawlDashboardProps) {
  const [selectedTypeTab, setSelectedTypeTab] = useState<string>(site.page_types[0]?.id || '');
  const [pagesList, setPagesList] = useState<SitePageItem[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pageStatusFilter, setPageStatusFilter] = useState<'all' | 'failed' | 'extracted'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const crawl = site.crawl;
  const isRunning = crawl?.status === 'running' || site.status === 'extracting';
  const isPaused = crawl?.status === 'paused';
  const isCompleted = crawl?.status === 'completed' || site.status === 'completed';
  const isFailed = crawl?.status === 'failed' || site.status === 'failed';
  const isCancelled = crawl?.status === 'cancelled';

  const totalPages = site.page_count || 1;
  const fetchedPages = crawl?.pages_fetched || site.extracted_count || 0;
  const failedPages = crawl?.pages_failed || 0;
  const percent = Math.min(100, Math.round(((fetchedPages + failedPages) / totalPages) * 100));

  // Auto-refresh poll every 2 seconds while running
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      onRefresh();
    }, 2000);
    return () => clearInterval(interval);
  }, [isRunning, onRefresh]);

  // Load pages list on filter change
  const loadPages = async () => {
    try {
      setPagesLoading(true);
      const res = await pithApi.getSitePages(site.id, {
        status: pageStatusFilter === 'all' ? undefined : pageStatusFilter,
        search: searchFilter.trim() || undefined,
        limit: 50,
      });
      setPagesList(res.pages || []);
    } catch (e) {
      console.error('Failed to load pages', e);
    } finally {
      setPagesLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, [site.id, pageStatusFilter, searchFilter, fetchedPages, failedPages]);

  const handleDownloadZip = () => {
    const exportUrl = pithApi.getSiteExportUrl(site.id, { format: 'zip' });
    window.open(exportUrl, '_blank');
  };

  const handleDownloadType = (typeId: string, format: 'csv' | 'json' | 'xlsx') => {
    const exportUrl = pithApi.getSiteExportUrl(site.id, { typeId, format });
    window.open(exportUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Status Banner */}
      <div className="p-6 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity
                className={`w-5 h-5 ${
                  isRunning
                    ? 'text-emerald-400 animate-pulse'
                    : isCompleted
                    ? 'text-emerald-400'
                    : isPaused
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              />
              <h2 className="text-lg font-bold font-mono text-zinc-100">
                Site Extraction Dashboard — {site.domain}
              </h2>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-1">
              Status:{' '}
              <span
                className={`font-semibold uppercase ${
                  isRunning
                    ? 'text-emerald-400'
                    : isCompleted
                    ? 'text-emerald-400'
                    : isPaused
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {crawl?.status || site.status}
              </span>{' '}
              • {fetchedPages} fetched • {failedPages} failed • {totalPages} total discovered
            </p>
          </div>

          {/* Action Control Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={onPause}
                className="font-mono text-xs gap-1.5 h-9 border-amber-800/50 text-amber-400 hover:bg-amber-950/40"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </Button>
            )}

            {isPaused && (
              <Button
                size="sm"
                variant="primary"
                onClick={onResume}
                className="font-mono text-xs gap-1.5 h-9"
              >
                <Play className="w-3.5 h-3.5" />
                Resume
              </Button>
            )}

            {(isRunning || isPaused) && (
              <Button
                size="sm"
                variant="danger"
                onClick={onCancel}
                className="font-mono text-xs gap-1.5 h-9"
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancel
              </Button>
            )}

            {failedPages > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetryFailed}
                className="font-mono text-xs gap-1.5 h-9 border-rose-800/50 text-rose-400 hover:bg-rose-950/40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Failed ({failedPages})
              </Button>
            )}

            {isCompleted && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleDownloadZip}
                className="font-mono text-xs font-bold gap-2 h-9 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <FileArchive className="w-4 h-4" />
                Download Complete Site (.ZIP)
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono text-zinc-400">
            <span>Overall Progress</span>
            <span className="font-bold text-zinc-200">{percent}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-zinc-950 overflow-hidden border border-zinc-800">
            <div
              className={`h-full transition-all duration-300 ${
                isCompleted
                  ? 'bg-emerald-500'
                  : isFailed
                  ? 'bg-rose-500'
                  : isPaused
                  ? 'bg-amber-500'
                  : 'bg-emerald-400'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800/80">
            <div className="text-[11px] font-mono text-zinc-400">Fetched Pages</div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {fetchedPages.toLocaleString()}
            </div>
          </div>

          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800/80">
            <div className="text-[11px] font-mono text-zinc-400">Failed / Blocked</div>
            <div className="text-lg font-bold font-mono text-rose-400 mt-0.5">
              {failedPages.toLocaleString()}
            </div>
          </div>

          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800/80">
            <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              Live Speed
            </div>
            <div className="text-lg font-bold font-mono text-zinc-200 mt-0.5">
              {crawl?.speed_pages_per_sec || 0} <span className="text-xs font-normal text-zinc-500">p/s</span>
            </div>
          </div>

          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800/80">
            <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-sky-400" />
              ETA Remaining
            </div>
            <div className="text-lg font-bold font-mono text-zinc-200 mt-0.5">
              {crawl?.estimated_time_remaining_sec ? `~${crawl.estimated_time_remaining_sec}s` : '—'}
            </div>
          </div>
        </div>

        {/* Notice Banner if Failed / Stopped early */}
        {(site.error_message || crawl?.error_message) && (
          <div className="p-3 rounded bg-rose-950/40 border border-rose-800/60 text-xs font-mono text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Notice: </span>
              {site.error_message || crawl?.error_message}
            </div>
          </div>
        )}
      </div>

      {/* Template Data & Export Center */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {site.page_types.map((pt) => {
              const isActive = selectedTypeTab === pt.id;
              return (
                <button
                  key={pt.id}
                  onClick={() => setSelectedTypeTab(pt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap flex items-center gap-2 border ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                      : 'bg-zinc-900/60 text-zinc-400 border-zinc-850 hover:bg-zinc-850'
                  }`}
                >
                  <span>{pt.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                    {pt.extracted_count || 0}/{pt.page_count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Export buttons for selected template */}
          {selectedTypeTab && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownloadType(selectedTypeTab, 'csv')}
                className="text-xs font-mono h-8 gap-1 border-zinc-700"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownloadType(selectedTypeTab, 'json')}
                className="text-xs font-mono h-8 gap-1 border-zinc-700"
              >
                <FileCode className="w-3.5 h-3.5 text-sky-400" />
                JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownloadType(selectedTypeTab, 'xlsx')}
                className="text-xs font-mono h-8 gap-1 border-zinc-700"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                XLSX
              </Button>
            </div>
          )}
        </div>

        {/* Selected Page Type Info & Sample Rows */}
        {(() => {
          const activeType = site.page_types.find((t) => t.id === selectedTypeTab);
          if (!activeType) return null;

          return (
            <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="font-semibold text-zinc-200">
                  Template Pattern: <span className="text-emerald-400">{activeType.pattern}</span>
                </span>
                <span>
                  Extracted {activeType.extracted_count || 0} of {activeType.page_count} pages
                </span>
              </div>

              {activeType.sample_rows && activeType.sample_rows.length > 0 ? (
                <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                      <tr>
                        {Object.keys(activeType.sample_rows[0] || {}).map((col) => (
                          <th key={col} className="px-3 py-2 font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {activeType.sample_rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-zinc-900/50">
                          {Object.keys(activeType.sample_rows[0] || {}).map((col) => {
                            const val = row[col];
                            const isUrl = typeof val === 'string' && val.startsWith('http');
                            return (
                              <td key={col} className="px-3 py-2 text-zinc-300 max-w-xs truncate">
                                {isUrl ? (
                                  <a
                                    href={val}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-400 hover:underline"
                                  >
                                    {val}
                                  </a>
                                ) : val !== null && val !== undefined ? (
                                  typeof val === 'object' ? (
                                    JSON.stringify(val)
                                  ) : (
                                    String(val)
                                  )
                                ) : (
                                  <span className="text-zinc-600">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 rounded border border-dashed border-zinc-800 text-center font-mono text-xs text-zinc-500">
                  Data extraction in progress. Extracted rows will appear here.
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Per-Page Status & Failed Pages Explorer */}
      <div className="p-5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold font-mono text-zinc-200">Discovered Pages & Status Log</h3>
            <span className="text-xs font-mono text-zinc-500">({pagesList.length} shown)</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter buttons */}
            <div className="flex items-center rounded bg-zinc-950 border border-zinc-800 p-0.5">
              {(['all', 'extracted', 'failed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setPageStatusFilter(filter)}
                  className={`px-2.5 py-1 text-xs font-mono rounded capitalize transition-colors ${
                    pageStatusFilter === filter
                      ? 'bg-zinc-800 text-zinc-100 font-bold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Filter URL..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded pl-8 pr-3 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700 w-40"
              />
            </div>
          </div>
        </div>

        {/* Pages Table */}
        <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950 max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900 sticky top-0 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">HTTP</th>
                <th className="px-3 py-2">Depth</th>
                <th className="px-3 py-2">Error / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850">
              {pagesList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                    No pages matching current filter.
                  </td>
                </tr>
              ) : (
                pagesList.map((page) => (
                  <tr key={page.id} className="hover:bg-zinc-900/40">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                          page.status === 'extracted'
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                            : page.status === 'failed'
                            ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                            : page.status === 'fetching'
                            ? 'bg-sky-950/60 text-sky-400 border border-sky-800/40 animate-pulse'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {page.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-300 max-w-sm truncate">
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <span className="truncate">{page.url}</span>
                        <ExternalLink className="w-3 h-3 text-zinc-500 shrink-0" />
                      </a>
                    </td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {page.http_status || '—'}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      d={page.depth}
                    </td>
                    <td className="px-3 py-2 text-rose-400 max-w-xs truncate">
                      {page.error || <span className="text-zinc-600">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Start New Discovery Button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={onReset}
          className="font-mono text-xs gap-1.5 border-zinc-700"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Start New Site Crawl
        </Button>
      </div>
    </div>
  );
}
