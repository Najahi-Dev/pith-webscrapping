'use client';

import React, { useState } from 'react';
import {
  Layers,
  FileText,
  ListFilter,
  CheckSquare,
  Square,
  Edit2,
  Check,
  ChevronDown,
  ChevronUp,
  Sliders,
  Play,
  Clock,
  HardDrive,
  ExternalLink,
  Code,
  Tag,
  AlertCircle
} from 'lucide-react';
import { Button } from '@pith/ui';
import { SitePageType } from '@pith/sdk';

interface SiteTypesViewProps {
  siteId: string;
  domain: string;
  pageTypes: SitePageType[];
  onUpdateType: (typeId: string, updates: Partial<SitePageType>) => Promise<void>;
  onStartExtraction: () => void;
  isStarting: boolean;
  crawlDelay?: number;
}

export function SiteTypesView({
  siteId,
  domain,
  pageTypes,
  onUpdateType,
  onStartExtraction,
  isStarting,
  crawlDelay = 0.2
}: SiteTypesViewProps) {
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(pageTypes[0]?.id || null);
  const [activeTab, setActiveTab] = useState<'samples' | 'selectors'>('samples');

  // Compute estimates
  const selectedTypes = pageTypes.filter((t) => t.is_included);
  const totalPagesToExtract = selectedTypes.reduce((acc, t) => acc + (t.page_count || 0), 0);
  const estimatedSeconds = Math.max(1, Math.round(totalPagesToExtract * (crawlDelay + 0.3) / 3));
  const estimatedSizeKB = totalPagesToExtract * 4; // ~4KB per structured row average

  const handleSaveName = async (typeId: string) => {
    if (editNameValue.trim()) {
      await onUpdateType(typeId, { name: editNameValue.trim() });
    }
    setEditingTypeId(null);
  };

  const handleToggleInclude = async (pt: SitePageType) => {
    await onUpdateType(pt.id, { is_included: !pt.is_included });
  };

  const handleToggleAll = async (include: boolean) => {
    for (const pt of pageTypes) {
      if (pt.is_included !== include) {
        await onUpdateType(pt.id, { is_included: include });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Batch Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-zinc-900/60 border border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold font-mono tracking-tight text-zinc-100">
              Discovered Site Map & Page Templates
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            {domain} — {pageTypes.length} distinct page templates discovered. Select templates to extract.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleToggleAll(true)}
            className="text-xs font-mono h-8 border-zinc-700"
          >
            Select All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleToggleAll(false)}
            className="text-xs font-mono h-8 border-zinc-700"
          >
            Deselect All
          </Button>
        </div>
      </div>

      {/* Page Types List */}
      <div className="space-y-3">
        {pageTypes.map((pt) => {
          const isExpanded = expandedTypeId === pt.id;
          const isEditing = editingTypeId === pt.id;

          return (
            <div
              key={pt.id}
              className={`rounded-lg border transition-all duration-200 overflow-hidden ${
                pt.is_included
                  ? 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                  : 'bg-zinc-950/40 border-zinc-900 opacity-60'
              }`}
            >
              {/* Header Row */}
              <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Inclusion Checkbox */}
                  <button
                    onClick={() => handleToggleInclude(pt)}
                    className="p-1 text-zinc-400 hover:text-emerald-400 transition-colors focus:outline-none"
                    title={pt.is_included ? 'Exclude from crawl' : 'Include in crawl'}
                  >
                    {pt.is_included ? (
                      <CheckSquare className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Square className="w-5 h-5 text-zinc-600" />
                    )}
                  </button>

                  {/* Title & Renaming */}
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveName(pt.id)}
                          className="bg-zinc-950 border border-emerald-500/50 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveName(pt.id)}
                          className="p-1 text-emerald-400 hover:text-emerald-300"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-zinc-200 truncate">
                          {pt.name}
                        </span>
                        <button
                          onClick={() => {
                            setEditingTypeId(pt.id);
                            setEditNameValue(pt.name);
                          }}
                          className="text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                          title="Rename template"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Pattern & Badges */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                        {pt.pattern}
                      </span>
                      {pt.is_listing ? (
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-400 border border-sky-800/40">
                          Listing
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                          Detail
                        </span>
                      )}
                      <span className="text-xs font-mono text-zinc-400">
                        {pt.page_count} page{pt.page_count !== 1 ? 's' : ''}
                      </span>
                      {pt.fields && pt.fields.length > 0 && (
                        <span className="text-xs font-mono text-zinc-500">
                          • {pt.fields.length} field{pt.fields.length !== 1 ? 's' : ''} detected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expand Toggle */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedTypeId(isExpanded ? null : pt.id)}
                    className="text-xs font-mono h-8 gap-1 text-zinc-400 hover:text-zinc-200"
                  >
                    {isExpanded ? 'Hide Sample' : 'View Sample'}
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Expanded Details / Sample Rows View */}
              {isExpanded && (
                <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 space-y-4">
                  {/* Sample URLs */}
                  {pt.sample_urls && pt.sample_urls.length > 0 && (
                    <div>
                      <div className="text-xs font-mono font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                        Sample Discovered URLs:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {pt.sample_urls.slice(0, 3).map((url, uIdx) => (
                          <a
                            key={uIdx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-emerald-400/90 hover:text-emerald-300 underline truncate max-w-md px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800"
                          >
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sample Data Table */}
                  {pt.sample_rows && pt.sample_rows.length > 0 ? (
                    <div>
                      <div className="text-xs font-mono font-medium text-zinc-400 mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-zinc-500" />
                          Detected Schema Preview (from sample pages):
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          Showing {pt.sample_rows.length} sample row{pt.sample_rows.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                            <tr>
                              {Object.keys(pt.sample_rows[0] || {}).map((col) => (
                                <th key={col} className="px-3 py-2 font-medium">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-850">
                            {pt.sample_rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-zinc-900/50">
                                {Object.keys(pt.sample_rows[0] || {}).map((col) => {
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
                    </div>
                  ) : (
                    <div className="p-4 rounded border border-dashed border-zinc-800 text-center font-mono text-xs text-zinc-500">
                      Standard text & metadata extraction configured for this template.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Extraction Estimation & Execution Bar */}
      <div className="p-5 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-xs text-zinc-400 font-mono">Selected Templates</div>
              <div className="text-sm font-bold font-mono text-zinc-100">
                {selectedTypes.length} of {pageTypes.length}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <div>
              <div className="text-xs text-zinc-400 font-mono">Total Pages</div>
              <div className="text-sm font-bold font-mono text-zinc-100">
                {totalPagesToExtract.toLocaleString()} pages
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <div>
              <div className="text-xs text-zinc-400 font-mono">Estimated Time</div>
              <div className="text-sm font-bold font-mono text-zinc-100">
                ~{estimatedSeconds < 60 ? `${estimatedSeconds}s` : `${Math.round(estimatedSeconds / 60)}m`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-indigo-400" />
            <div>
              <div className="text-xs text-zinc-400 font-mono">Est. Payload</div>
              <div className="text-sm font-bold font-mono text-zinc-100">
                ~{estimatedSizeKB < 1024 ? `${estimatedSizeKB} KB` : `${(estimatedSizeKB / 1024).toFixed(1)} MB`}
              </div>
            </div>
          </div>
        </div>

        <div>
          <Button
            size="lg"
            variant="primary"
            onClick={onStartExtraction}
            disabled={selectedTypes.length === 0 || isStarting}
            className="font-mono text-xs font-bold gap-2 px-6 h-11"
          >
            <Play className="w-4 h-4 fill-current" />
            {isStarting ? 'Initiating Crawl...' : `Extract All Selected (${totalPagesToExtract} Pages)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
