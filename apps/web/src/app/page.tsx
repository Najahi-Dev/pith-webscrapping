'use client';

import React, { useState } from 'react';
import {
  Globe,
  ShieldCheck,
  Zap,
  Layers,
  MousePointer,
  Play,
  Download,
  Bookmark,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileCode,
  Sparkles,
} from 'lucide-react';
import {
  Button,
  UrlInput,
  CheckList,
  ScrapabilityBadge,
  CategoryCard,
  DataPreviewTable,
  VisualPickerFrame,
} from '@pith/ui';
import {
  pithApi,
  CheckResponse,
  DetectResponse,
  PreviewResponse,
  JobResponse,
} from '@/lib/api';
import { RecipeModal } from '@/components/recipe-modal';

const DEMO_PRESETS = [
  { label: 'E-commerce Catalog', url: 'https://news.ycombinator.com', note: 'Hacker News frontpage' },
  { label: 'Wikipedia Article', url: 'https://en.wikipedia.org/wiki/Web_scraping', note: 'Rich tables & content' },
  { label: 'Books To Scrape', url: 'http://books.toscrape.com', note: 'Public sandbox catalog' },
  { label: 'Quotes To Scrape', url: 'http://quotes.toscrape.com', note: 'Multi-page quote listings' },
];

export default function StudioPage() {
  const [currentUrl, setCurrentUrl] = useState('');
  const [method, setMethod] = useState<'http' | 'playwright'>('http');
  const [step, setStep] = useState<'input' | 'checked' | 'detected' | 'running' | 'results'>('input');

  // API Results States
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  const [detectResult, setDetectResult] = useState<DetectResponse | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(null);
  const [jobResult, setJobResult] = useState<JobResponse | null>(null);

  // Selection & Config States
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [visualModeActive, setVisualModeActive] = useState(false);
  const [customContainer, setCustomContainer] = useState<string | undefined>();
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [paginationEnabled, setPaginationEnabled] = useState(false);
  const [maxPages, setMaxPages] = useState(3);
  const [cleaningRules, setCleaningRules] = useState({
    trim_whitespace: true,
    remove_duplicates: true,
    normalize_prices: true,
    normalize_dates: true,
    make_urls_absolute: true,
  });

  // Loading & Error States
  const [checking, setChecking] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [runningJob, setRunningJob] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [showHeadersDrawer, setShowHeadersDrawer] = useState(false);
  const [rawHeadersInput, setRawHeadersInput] = useState('');

  const parseHeaders = (): Record<string, string> | undefined => {
    if (!rawHeadersInput.trim()) return undefined;
    const headers: Record<string, string> = {};
    const lines = rawHeadersInput.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) headers[k] = v;
      }
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  };

  // Step 1: Run Safety Check & Scrapability Evaluation
  const handleInspectUrl = async (url: string) => {
    setCurrentUrl(url);
    setChecking(true);
    setErrorMessage(null);
    setCheckResult(null);
    setDetectResult(null);
    setPreviewResult(null);
    setJobResult(null);

    const customHeaders = parseHeaders();

    try {
      const res = await pithApi.check(url, customHeaders);
      setCheckResult(res);
      setMethod(res.recommended_method || 'http');
      setStep('checked');

      // Auto-trigger pattern detection if scrapable
      if (res.allowed) {
        handleDetectPatterns(url, res.recommended_method || 'http', customHeaders);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Inspection failed');
    } finally {
      setChecking(false);
    }
  };

  // Step 2: Detect Data Patterns & Categories
  const handleDetectPatterns = async (
    url: string,
    engineMethod: 'http' | 'playwright',
    customHeaders?: Record<string, string>
  ) => {
    setDetecting(true);
    try {
      const [detRes, prevRes] = await Promise.all([
        pithApi.detect(url, { method: engineMethod, customHeaders }),
        pithApi.preview(url, { method: engineMethod, customHeaders }),
      ]);
      setDetectResult(detRes);
      setPreviewResult(prevRes);

      if (detRes.categories.length > 0) {
        setSelectedCategoryId(detRes.categories[0].id);
      }
      setStep('detected');
    } catch (err: any) {
      setErrorMessage(err.message || 'Data detection failed');
    } finally {
      setDetecting(false);
    }
  };

  // Step 3: Run Extraction Job
  const handleRunJob = async () => {
    if (!currentUrl) return;

    setRunningJob(true);
    setStep('running');
    setErrorMessage(null);

    const customHeaders = parseHeaders();

    try {
      const selectorsPayload =
        visualModeActive && customFields.length > 0
          ? {
              container: customContainer,
              fields: customFields.reduce((acc, f) => {
                acc[f.name] = { selector: f.selector, attribute: f.attribute };
                return acc;
              }, {} as Record<string, any>),
            }
          : undefined;

      const job = await pithApi.createJob({
        url: currentUrl,
        method: method,
        category_id: !visualModeActive && selectedCategoryId ? selectedCategoryId : undefined,
        selectors: selectorsPayload,
        pagination: {
          enabled: paginationEnabled,
          max_pages: maxPages,
        },
        cleaning_rules: cleaningRules,
        custom_headers: customHeaders,
      });

      // Poll until completion
      const completedJob = await pithApi.waitForJob(job.id, 800, 90000, (prog) => {
        setJobResult((prev) => (prev ? { ...prev, progress: prog } : (job as any)));
      });

      setJobResult(completedJob);
      setStep('results');
    } catch (err: any) {
      setErrorMessage(err.message || 'Job execution failed');
      setStep('detected');
    } finally {
      setRunningJob(false);
    }
  };

  // Export Action Handler
  const handleExport = async (format: 'csv' | 'json' | 'xlsx') => {
    if (!jobResult) return;
    try {
      const data = await pithApi.exportJob(jobResult.id, format, true);
      const mime = format === 'csv' ? 'text/csv' : format === 'json' ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pith_export_${jobResult.id.slice(0, 8)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Top Banner / Hero */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest bg-emerald-950 text-emerald-400 border border-emerald-800 rounded">
                Extraction Studio
              </span>
              <span className="text-zinc-500 text-xs">• Ethical Crawling Guard</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-100 mt-1">
              Autonomous DOM Detection & Extraction
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 uppercase font-semibold">Engine:</span>
            <div className="flex bg-zinc-950 p-0.5 rounded border border-zinc-800">
              <button
                type="button"
                onClick={() => setMethod('http')}
                className={`px-2.5 py-1 text-xs font-semibold rounded uppercase ${
                  method === 'http' ? 'bg-emerald-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Fast HTTP
              </button>
              <button
                type="button"
                onClick={() => setMethod('playwright')}
                className={`px-2.5 py-1 text-xs font-semibold rounded uppercase ${
                  method === 'playwright' ? 'bg-cyan-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Playwright JS
              </button>
            </div>
          </div>
        </div>

        {/* URL Input Bar */}
        <div className="pt-2 space-y-2">
          <UrlInput
            initialUrl={currentUrl}
            onSubmit={handleInspectUrl}
            loading={checking || detecting}
            error={errorMessage}
            placeholder="Enter target URL to check and scrape (e.g. https://example.com/products)..."
          />

          {/* Request Headers & Auth Dropdown */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowHeadersDrawer(!showHeadersDrawer)}
              className="text-[11px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
            >
              <span>{showHeadersDrawer ? '▼ Hide Custom Request Headers / API Key' : '▶ Add Custom Request Headers / API Key'}</span>
            </button>

            {showHeadersDrawer && (
              <div className="mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded space-y-2 animate-in fade-in">
                <div className="text-[10.5px] text-zinc-400">
                  Pass custom authentication tokens, session cookies, or API keys (one per line, e.g. <code className="text-emerald-400">Authorization: Bearer YOUR_TOKEN</code>):
                </div>
                <textarea
                  rows={2}
                  placeholder={`Authorization: Bearer YOUR_API_KEY\nCookie: session_id=abc123`}
                  value={rawHeadersInput}
                  onChange={(e) => setRawHeadersInput(e.target.value)}
                  className="w-full p-2 bg-zinc-900 border border-zinc-700/80 rounded font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Preset Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-zinc-400">
          <span className="text-zinc-500 uppercase font-semibold text-[10px]">Quick Presets:</span>
          {DEMO_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleInspectUrl(preset.url)}
              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded text-zinc-300 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 & 3: Check Results & Scrapability Badge */}
      {checkResult && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              1. Scrapability Assessment & Compliance Checklist
            </h2>
            <span className="text-xs text-zinc-500">
              Target: <code className="text-zinc-300">{checkResult.url}</code>
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <ScrapabilityBadge
                score={checkResult.score}
                level={checkResult.level}
                recommendedMethod={checkResult.recommended_method}
                reasons={checkResult.reasons}
              />
            </div>
            <div className="lg:col-span-2">
              <CheckList items={checkResult.checklist} />
            </div>
          </div>
        </div>
      )}

      {/* Step 4 & 5: Detected Data & Visual Selector */}
      {detectResult && checkResult?.allowed && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" />
              2. Data Detection & Structure Selection ({detectResult.total_categories} Found)
            </h2>

            {/* Mode Switcher: Category Grid vs Visual Picker */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisualModeActive(false)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  !visualModeActive
                    ? 'bg-zinc-800 border-zinc-600 text-emerald-400 font-semibold'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Auto-Detected Categories
              </button>
              <button
                type="button"
                onClick={() => setVisualModeActive(true)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors flex items-center gap-1.5 ${
                  visualModeActive
                    ? 'bg-zinc-800 border-zinc-600 text-cyan-400 font-semibold'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MousePointer className="w-3 h-3 text-cyan-400" />
                Visual Inspector
              </button>
            </div>
          </div>

          {!visualModeActive ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {detectResult.categories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  id={cat.id}
                  name={cat.name}
                  description={cat.description}
                  count={cat.count}
                  fields={cat.fields}
                  sampleRows={cat.sample_rows}
                  selector={cat.selector}
                  categoryType={cat.category_type}
                  selected={selectedCategoryId === cat.id}
                  onSelect={(id) => setSelectedCategoryId(id)}
                />
              ))}
            </div>
          ) : (
            previewResult && (
              <VisualPickerFrame
                previewHtml={previewResult.sanitized_html}
                targetUrl={currentUrl}
                initialContainer={customContainer}
                onChange={(container, fields) => {
                  setCustomContainer(container);
                  setCustomFields(fields);
                }}
              />
            )
          )}

          {/* Job Configuration Strip (Pagination & Cleaning) */}
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-6 text-xs">
                {/* Pagination */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="page_toggle"
                    checked={paginationEnabled}
                    onChange={(e) => setPaginationEnabled(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <label htmlFor="page_toggle" className="text-zinc-300 font-semibold cursor-pointer">
                    Enable Pagination
                  </label>
                  {paginationEnabled && (
                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-zinc-500 text-[11px]">Max Pages:</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={maxPages}
                        onChange={(e) => setMaxPages(parseInt(e.target.value, 10) || 1)}
                        className="w-14 h-7 px-1.5 bg-zinc-900 border border-zinc-700 rounded text-center text-xs text-zinc-100"
                      />
                    </div>
                  )}
                </div>

                {/* Cleaning toggles summary */}
                <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
                  <Sliders className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Pipeline: Whitespace Trim, Dedup, ISO Dates, Absolute URLs Active</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleRunJob}
                  loading={runningJob}
                  icon={<Play className="w-4 h-4" />}
                >
                  Run Extraction Job
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 6: Live Job Running & Results Table */}
      {step === 'running' && jobResult && (
        <div className="p-6 bg-zinc-950 border border-zinc-800 rounded text-center space-y-4 animate-in fade-in">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            Extracting dataset from {currentUrl}...
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${jobResult.progress.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>{jobResult.progress.message}</span>
              <span>{jobResult.progress.rows_extracted} rows</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 7: Completed Results & Actions */}
      {step === 'results' && jobResult && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                3. Extraction Results ({jobResult.row_count} rows in {jobResult.duration_ms}ms)
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsRecipeModalOpen(true)}
                icon={<Bookmark className="w-3.5 h-3.5 text-amber-400" />}
              >
                Save as Recipe
              </Button>
            </div>
          </div>

          <DataPreviewTable
            rows={jobResult.results || []}
            rawRows={jobResult.raw_results || []}
            columns={jobResult.columns || []}
            onExport={handleExport}
          />
        </div>
      )}

      {/* Save Recipe Modal */}
      <RecipeModal
        isOpen={isRecipeModalOpen}
        onClose={() => setIsRecipeModalOpen(false)}
        url={currentUrl}
        method={method}
        categoryId={!visualModeActive && selectedCategoryId ? selectedCategoryId : undefined}
        selectors={
          visualModeActive && customFields.length > 0
            ? {
                container: customContainer,
                fields: customFields.reduce((acc, f) => {
                  acc[f.name] = { selector: f.selector, attribute: f.attribute };
                  return acc;
                }, {} as Record<string, any>),
              }
            : undefined
        }
        pagination={{
          enabled: paginationEnabled,
          max_pages: maxPages,
        }}
        cleaningRules={cleaningRules}
        onSaved={(rec) => {
          alert(`Recipe "${rec.name}" saved! View it in the Recipes dashboard.`);
        }}
      />
    </div>
  );
}
