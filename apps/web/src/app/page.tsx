'use client';

import React, { useState, useEffect } from 'react';
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
  Network,
  Compass,
  FileArchive,
  Search,
  Check,
  AlertTriangle,
  Type,
  DollarSign,
  Calendar,
  Link2,
  SlidersHorizontal,
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
  SiteResponse,
  SitePageType,
} from '@/lib/api';
import { RecipeModal } from '@/components/recipe-modal';
import { SiteTypesView } from '@/components/site-types-view';
import { SiteCrawlDashboard } from '@/components/site-crawl-dashboard';

const DEMO_PRESETS = [
  { label: 'E-commerce Catalog', url: 'https://news.ycombinator.com', note: 'Hacker News frontpage' },
  { label: 'Wikipedia Article', url: 'https://en.wikipedia.org/wiki/Web_scraping', note: 'Rich tables & content' },
  { label: 'Books To Scrape', url: 'http://books.toscrape.com', note: 'Public sandbox catalog' },
  { label: 'Quotes To Scrape', url: 'http://quotes.toscrape.com', note: 'Multi-page quote listings' },
];

const SITE_DEMO_PRESETS = [
  { label: 'Books Sandbox', url: 'http://books.toscrape.com', note: '1,000 items & category sitemaps' },
  { label: 'Quotes Catalog', url: 'http://quotes.toscrape.com', note: 'Author & tag page types' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com', note: 'Story items & comment trees' },
];

const CLEANING_CONFIGS = [
  { key: 'trim_whitespace' as const, label: 'Trim Whitespace', icon: Type, desc: 'Clean excess whitespace' },
  { key: 'remove_duplicates' as const, label: 'Deduplicate Rows', icon: Layers, desc: 'Drop repeated identical rows' },
  { key: 'normalize_prices' as const, label: 'Normalize Prices', icon: DollarSign, desc: 'Currency code & clean float' },
  { key: 'normalize_dates' as const, label: 'ISO Dates', icon: Calendar, desc: 'Format to ISO-8601' },
  { key: 'make_urls_absolute' as const, label: 'Absolute URLs', icon: Link2, desc: 'Prefix with target base URL' },
];

export default function StudioPage() {
  // Mode: 'page' (Single URL) or 'site' (Whole Site Crawler)
  const [mode, setMode] = useState<'page' | 'site'>('page');

  // Common Configuration
  const [method, setMethod] = useState<'http' | 'playwright'>('http');
  const [rawHeadersInput, setRawHeadersInput] = useState('');
  const [showHeadersDrawer, setShowHeadersDrawer] = useState(false);

  // ==================== PAGE MODE STATES ====================
  const [currentUrl, setCurrentUrl] = useState('');
  const [step, setStep] = useState<'input' | 'checked' | 'detected' | 'running' | 'results'>('input');
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  const [detectResult, setDetectResult] = useState<DetectResponse | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(null);
  const [jobResult, setJobResult] = useState<JobResponse | null>(null);
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
  const [checking, setChecking] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [runningJob, setRunningJob] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);

  // ==================== SITE MODE STATES ====================
  const [siteUrl, setSiteUrl] = useState('');
  const [siteStep, setSiteStep] = useState<'input' | 'discovering' | 'discovered' | 'extracting'>('input');
  const [siteMaxPages, setSiteMaxPages] = useState(100);
  const [siteMaxDepth, setSiteMaxDepth] = useState(3);
  const [siteCrawlDelay, setSiteCrawlDelay] = useState(0.2);
  const [siteIncludeSubdomains, setSiteIncludeSubdomains] = useState(false);
  const [siteDiscovering, setSiteDiscovering] = useState(false);
  const [siteData, setSiteData] = useState<SiteResponse | null>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [isStartingExtract, setIsStartingExtract] = useState(false);
  const [showAdvancedSiteOpts, setShowAdvancedSiteOpts] = useState(false);

  const parseHeaders = (): Record<string, string> | undefined => {
    if (!rawHeadersInput.trim()) return undefined;
    const headers: Record<string, string> = {};
    const lines = rawHeadersInput.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) headers[k] = v;
      } else if (line.includes('=') || line.includes(';')) {
        headers['Cookie'] = (headers['Cookie'] ? headers['Cookie'] + '; ' : '') + line;
      } else if (line.startsWith('Bearer ') || line.startsWith('bearer ')) {
        headers['Authorization'] = line;
      } else if (line.length > 20 && !headers['Authorization'] && !line.includes(' ')) {
        headers['Authorization'] = `Bearer ${line}`;
      }
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  };

  const handleEngineChange = (newMethod: 'http' | 'playwright') => {
    setMethod(newMethod);
    if (mode === 'page' && currentUrl && checkResult?.allowed) {
      const customHeaders = parseHeaders();
      handleDetectPatterns(currentUrl, newMethod, customHeaders);
    }
  };

  // ==================== PAGE MODE HANDLERS ====================
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
      const engineToUse = method === 'playwright' ? 'playwright' : (res.recommended_method || 'http');
      setMethod(engineToUse);
      setStep('checked');

      if (res.allowed) {
        handleDetectPatterns(url, engineToUse, customHeaders);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Inspection failed');
    } finally {
      setChecking(false);
    }
  };

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

  const handleExport = async (format: 'csv' | 'json' | 'xlsx') => {
    if (!jobResult) return;
    try {
      const data = await pithApi.exportJob(jobResult.id, format, true);
      const mime =
        format === 'csv'
          ? 'text/csv'
          : format === 'json'
          ? 'application/json'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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

  // ==================== SITE MODE HANDLERS ====================
  const handleStartSiteDiscovery = async (urlToDiscover?: string) => {
    const target = (urlToDiscover || siteUrl).trim();
    if (!target) return;

    setSiteUrl(target);
    setSiteDiscovering(true);
    setSiteStep('discovering');
    setSiteError(null);
    setSiteData(null);

    try {
      const res = await pithApi.discoverSite({
        url: target,
        max_pages: siteMaxPages,
        max_depth: siteMaxDepth,
        crawl_delay: siteCrawlDelay,
        include_subdomains: siteIncludeSubdomains,
        method: method,
      });

      // Poll until discovery complete
      const pollInterval = setInterval(async () => {
        try {
          const site = await pithApi.getSite(res.site_id);
          setSiteData(site);
          if (site.status === 'discovered' || site.status === 'completed' || site.status === 'failed') {
            clearInterval(pollInterval);
            setSiteDiscovering(false);
            if (site.status === 'failed') {
              setSiteError(site.error_message || 'Discovery encountered errors');
            } else {
              setSiteStep('discovered');
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 1500);
    } catch (err: any) {
      setSiteError(err.message || 'Failed to start site discovery');
      setSiteDiscovering(false);
      setSiteStep('input');
    }
  };

  const handleUpdatePageType = async (typeId: string, updates: Partial<SitePageType>) => {
    if (!siteData) return;
    try {
      const updatedType = await pithApi.updatePageType(siteData.id, typeId, updates);
      setSiteData({
        ...siteData,
        page_types: siteData.page_types.map((pt) => (pt.id === typeId ? { ...pt, ...updatedType } : pt)),
      });
    } catch (err: any) {
      alert(`Failed to update page template: ${err.message}`);
    }
  };

  const handleStartSiteExtraction = async () => {
    if (!siteData) return;
    setIsStartingExtract(true);
    try {
      await pithApi.extractSite(siteData.id);
      setSiteStep('extracting');
      // Refresh site data
      const updated = await pithApi.getSite(siteData.id);
      setSiteData(updated);
    } catch (err: any) {
      alert(`Extraction start failed: ${err.message}`);
    } finally {
      setIsStartingExtract(false);
    }
  };

  const handleRefreshSite = async () => {
    if (!siteData) return;
    try {
      const updated = await pithApi.getSite(siteData.id);
      setSiteData(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePauseSite = async () => {
    if (!siteData) return;
    await pithApi.pauseSiteCrawl(siteData.id);
    await handleRefreshSite();
  };

  const handleResumeSite = async () => {
    if (!siteData) return;
    await pithApi.resumeSiteCrawl(siteData.id);
    await handleRefreshSite();
  };

  const handleCancelSite = async () => {
    if (!siteData) return;
    await pithApi.cancelSiteCrawl(siteData.id);
    await handleRefreshSite();
  };

  const handleRetryFailed = async () => {
    if (!siteData) return;
    await pithApi.retryFailedPages(siteData.id);
    await handleRefreshSite();
  };

  const handleResetSite = () => {
    setSiteStep('input');
    setSiteData(null);
    setSiteError(null);
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

          {/* Mode Switcher (Page vs Site) & Engine Selection */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              <button
                type="button"
                onClick={() => setMode('page')}
                className={`px-3 py-1 text-xs font-mono font-bold rounded transition-colors flex items-center gap-1.5 ${
                  mode === 'page'
                    ? 'bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                Page Mode
              </button>
              <button
                type="button"
                onClick={() => setMode('site')}
                className={`px-3 py-1 text-xs font-mono font-bold rounded transition-colors flex items-center gap-1.5 ${
                  mode === 'site'
                    ? 'bg-emerald-600 text-white font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                Site Mode (Whole Site)
              </button>
            </div>

            {/* Engine Selection */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 uppercase font-semibold">Engine:</span>
              <div className="flex bg-zinc-950 p-0.5 rounded border border-zinc-800">
                <button
                  type="button"
                  onClick={() => handleEngineChange('http')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded uppercase ${
                    method === 'http' ? 'bg-emerald-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Fast HTTP
                </button>
                <button
                  type="button"
                  onClick={() => handleEngineChange('playwright')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded uppercase ${
                    method === 'playwright' ? 'bg-cyan-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Playwright JS
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SITE MODE INTERFACE */}
        {/* ========================================================================= */}
        {mode === 'site' && (
          <div className="space-y-4 pt-2">
            {siteStep === 'input' && (
              <div className="space-y-3">
                <div className="text-xs text-zinc-400 font-mono">
                  Enter one root URL. Pith discovers pages via sitemaps & BFS links, clusters them into page templates, detects data fields, and extracts whole-site datasets.
                </div>

                <UrlInput
                  initialUrl={siteUrl}
                  onSubmit={(url) => handleStartSiteDiscovery(url)}
                  loading={siteDiscovering}
                  error={siteError}
                  placeholder="Enter website root URL (e.g. http://books.toscrape.com)..."
                />

                {/* Advanced Discovery Options Toggle */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSiteOpts(!showAdvancedSiteOpts)}
                    className="text-[11px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                  >
                    <span>{showAdvancedSiteOpts ? '▼ Hide Discovery Limits & Settings' : '▶ Configure Discovery Limits & Delay'}</span>
                  </button>

                  <div className="text-[11px] text-zinc-500">
                    Max cap: {siteMaxPages} pages • Depth: {siteMaxDepth} • Delay: {siteCrawlDelay}s
                  </div>
                </div>

                {/* Advanced Options Box */}
                {showAdvancedSiteOpts && (
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in">
                    <div>
                      <label className="text-[11px] font-mono text-zinc-400 block mb-1">Max Pages Limit</label>
                      <select
                        value={siteMaxPages}
                        onChange={(e) => setSiteMaxPages(parseInt(e.target.value, 10))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                      >
                        <option value={50}>50 pages (Fast)</option>
                        <option value={100}>100 pages (Standard)</option>
                        <option value={500}>500 pages (Medium)</option>
                        <option value={1000}>1,000 pages (Large)</option>
                        <option value={2000}>2,000 pages (Max Cap)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-zinc-400 block mb-1">Max Crawl Depth</label>
                      <select
                        value={siteMaxDepth}
                        onChange={(e) => setSiteMaxDepth(parseInt(e.target.value, 10))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                      >
                        <option value={1}>1 (Direct links only)</option>
                        <option value={2}>2 (Standard catalog)</option>
                        <option value={3}>3 (Deep hierarchy)</option>
                        <option value={5}>5 (Full tree)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-zinc-400 block mb-1">Crawl Delay (seconds)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={siteCrawlDelay}
                        onChange={(e) => setSiteCrawlDelay(parseFloat(e.target.value) || 0)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-zinc-300">
                        <input
                          type="checkbox"
                          checked={siteIncludeSubdomains}
                          onChange={(e) => setSiteIncludeSubdomains(e.target.checked)}
                          className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                        />
                        Include Subdomains
                      </label>
                    </div>

                    {/* Warning if crawl is large */}
                    {siteMaxPages >= 1000 && (
                      <div className="col-span-full p-2.5 rounded bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Large Crawl Warning: Crawling &gt;1,000 pages will take several minutes and obeys respectful rate limits.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Preset Demos */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <span className="text-[11px] text-zinc-500 font-mono">Presets:</span>
                  {SITE_DEMO_PRESETS.map((p) => (
                    <button
                      key={p.url}
                      onClick={() => handleStartSiteDiscovery(p.url)}
                      className="px-2.5 py-1 text-xs font-mono bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-emerald-400 rounded transition-colors"
                      title={p.note}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live Discovery State Counter */}
            {siteStep === 'discovering' && (
              <div className="p-8 rounded-lg bg-zinc-950 border border-zinc-800 text-center space-y-4 animate-in fade-in">
                <div className="flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin flex items-center justify-center" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-mono text-zinc-100">
                    Discovering Website Structure...
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono mt-1">
                    Inspecting robots.txt, sitemaps (nested/gzip), and crawling internal links.
                  </p>
                </div>

                {siteData && (
                  <div className="flex items-center justify-center gap-6 pt-2">
                    <div className="px-4 py-2 rounded bg-zinc-900 border border-zinc-800 text-left">
                      <div className="text-[10px] text-zinc-500 uppercase">Pages Found</div>
                      <div className="text-xl font-bold font-mono text-emerald-400">
                        {siteData.crawl?.pages_discovered || siteData.page_count || 0}
                      </div>
                    </div>
                    <div className="px-4 py-2 rounded bg-zinc-900 border border-zinc-800 text-left">
                      <div className="text-[10px] text-zinc-500 uppercase">Pages Checked</div>
                      <div className="text-xl font-bold font-mono text-sky-400">
                        {siteData.crawl?.pages_fetched || 0}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* PAGE MODE INTERFACE */}
        {/* ========================================================================= */}
        {mode === 'page' && (
          <>
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
                      Paste headers, Authorization token, or cookies. Format: <code className="text-emerald-400">Header-Name: Value</code> or <code className="text-emerald-400">session_id=xyz123</code> (one per line):
                    </div>
                    <textarea
                      rows={3}
                      value={rawHeadersInput}
                      onChange={(e) => setRawHeadersInput(e.target.value)}
                      placeholder={'Cookie: session_id=abc12345; auth_token=xyz987\nAuthorization: Bearer your_api_token_here\nUser-Agent: CustomBot/1.0'}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-[11px] text-zinc-500 font-mono">Presets:</span>
              {DEMO_PRESETS.map((p) => (
                <button
                  key={p.url}
                  onClick={() => handleInspectUrl(p.url)}
                  className="px-2.5 py-1 text-xs font-mono bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-emerald-400 rounded transition-colors"
                  title={p.note}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SITE MODE VIEWS (Discovered & Crawl Dashboard) */}
      {/* ========================================================================= */}
      {mode === 'site' && siteData && (
        <>
          {siteStep === 'discovered' && (
            <SiteTypesView
              siteId={siteData.id}
              domain={siteData.domain}
              pageTypes={siteData.page_types || []}
              onUpdateType={handleUpdatePageType}
              onStartExtraction={handleStartSiteExtraction}
              isStarting={isStartingExtract}
              crawlDelay={siteCrawlDelay}
            />
          )}

          {siteStep === 'extracting' && (
            <SiteCrawlDashboard
              site={siteData}
              onRefresh={handleRefreshSite}
              onPause={handlePauseSite}
              onResume={handleResumeSite}
              onCancel={handleCancelSite}
              onRetryFailed={handleRetryFailed}
              onReset={handleResetSite}
            />
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* PAGE MODE VIEWS */}
      {/* ========================================================================= */}
      {mode === 'page' && (
        <>
          {/* Section 1: Scrapability & Safety Checklist */}
          {checkResult && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
                    Step 1: Safety & Scrapability Evaluation
                  </h2>
                </div>
                <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
                  SSRF Guard • Robots Exclusion • Bot Defenses
                </span>
              </div>

              {/* High-density Side-by-Side Dashboard */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                <div className="lg:col-span-5 flex flex-col">
                  <ScrapabilityBadge
                    score={checkResult.score}
                    level={checkResult.level}
                    recommendedMethod={checkResult.recommended_method}
                    activeMethod={method}
                    reasons={checkResult.reasons}
                    className="h-full"
                  />
                </div>

                <div className="lg:col-span-7 flex flex-col">
                  <CheckList
                    items={checkResult.checklist}
                    className="h-full"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Detected Patterns, Categories & Schema */}
          {detectResult && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
                    Step 2: Discovered Structures & Categories ({detectResult.total_categories})
                  </h2>
                </div>

                <Button
                  size="sm"
                  variant={visualModeActive ? 'primary' : 'outline'}
                  onClick={() => setVisualModeActive(!visualModeActive)}
                  className="gap-2 text-xs font-mono h-8 border-zinc-700"
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  {visualModeActive ? 'Visual Picker Active' : 'Open Visual Picker'}
                </Button>
              </div>

              {/* Visual Picker Frame Mode */}
              {visualModeActive && previewResult && (
                <VisualPickerFrame
                  previewHtml={previewResult.sanitized_html}
                  targetUrl={currentUrl}
                  onChange={(container, fields) => {
                    setCustomFields(fields);
                    setCustomContainer(container);
                  }}
                />
              )}

              {/* Auto-detected Category Cards */}
              {!visualModeActive && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              )}

              {/* Extraction Options Bar */}
              <div className="border border-zinc-800 bg-zinc-900/70 rounded-lg p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold font-mono text-zinc-200">
                    <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                    <span>Extraction Configuration & Cleaning Rules</span>
                  </div>

                  {/* Follow Pagination Pill & Stepper */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPaginationEnabled(!paginationEnabled)}
                      className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-mono border transition-all ${
                        paginationEnabled
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm'
                          : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${paginationEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                      <span>Follow Pagination</span>
                    </button>

                    {paginationEnabled && (
                      <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded px-2 py-1">
                        <span className="text-[10px] text-zinc-500 uppercase font-mono">Max Pages:</span>
                        <button
                          type="button"
                          onClick={() => setMaxPages(Math.max(1, maxPages - 1))}
                          className="text-zinc-400 hover:text-white px-1 text-xs font-bold leading-none"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold text-emerald-400 px-1">{maxPages}</span>
                        <button
                          type="button"
                          onClick={() => setMaxPages(Math.min(10, maxPages + 1))}
                          className="text-zinc-400 hover:text-white px-1 text-xs font-bold leading-none"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tactile Cleaning Pipeline Chips */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1 border-t border-zinc-800/80">
                  {CLEANING_CONFIGS.map((cfg) => {
                    const isActive = cleaningRules[cfg.key];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={cfg.key}
                        type="button"
                        onClick={() => setCleaningRules({ ...cleaningRules, [cfg.key]: !isActive })}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                          isActive
                            ? 'bg-zinc-950/90 border-emerald-500/40 text-zinc-200 shadow-[0_0_12px_rgba(16,185,129,0.06)]'
                            : 'bg-zinc-950/40 border-zinc-850 text-zinc-500 hover:border-zinc-750 hover:text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`p-1.5 rounded ${isActive ? 'bg-emerald-950 text-emerald-400' : 'bg-zinc-900 text-zinc-600'}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-mono font-semibold truncate ${isActive ? 'text-zinc-200' : 'text-zinc-400'}`}>
                              {cfg.label}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500 truncate">
                              {cfg.desc}
                            </div>
                          </div>
                        </div>

                        <div
                          className={`ml-2 shrink-0 w-4 h-4 rounded flex items-center justify-center transition-colors ${
                            isActive ? 'bg-emerald-500 text-zinc-950' : 'border border-zinc-750 text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Primary Action Button Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
                  <Button
                    size="lg"
                    variant="primary"
                    onClick={handleRunJob}
                    loading={runningJob}
                    icon={<Play className="w-4 h-4 fill-current shrink-0" />}
                    className="font-bold font-mono text-xs px-7 h-11 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all"
                  >
                    Extract Dataset Now
                  </Button>

                  <Button
                    size="md"
                    variant="outline"
                    onClick={() => setIsRecipeModalOpen(true)}
                    icon={<Bookmark className="w-4 h-4 text-emerald-400 shrink-0" />}
                    className="text-xs font-mono border-zinc-750 text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-950/20 h-11 px-5 whitespace-nowrap"
                  >
                    Save as Scheduled Recipe
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Extracted Dataset & Results View */}
          {jobResult && (
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
                      Step 3: Extraction Completed
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Extracted {jobResult.row_count} rows across {jobResult.columns.length} columns in {jobResult.duration_ms}ms
                  </p>
                </div>

                {/* Export Buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport('csv')}
                    className="text-xs gap-1 border-zinc-700"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport('json')}
                    className="text-xs gap-1 border-zinc-700"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-400" />
                    JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport('xlsx')}
                    className="text-xs gap-1 border-zinc-700"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    Excel (XLSX)
                  </Button>
                </div>
              </div>

              {/* Data Table Preview */}
              <DataPreviewTable
                columns={jobResult.columns}
                rows={jobResult.results || []}
                rawRows={jobResult.raw_results || undefined}
                onExport={handleExport}
              />
            </div>
          )}
        </>
      )}

      {/* Recipe Modal */}
      {isRecipeModalOpen && (
        <RecipeModal
          isOpen={isRecipeModalOpen}
          onClose={() => setIsRecipeModalOpen(false)}
          url={currentUrl}
          method={method}
          categoryId={selectedCategoryId || undefined}
          pagination={{ enabled: paginationEnabled, max_pages: maxPages }}
          cleaningRules={cleaningRules}
        />
      )}
    </div>
  );
}
