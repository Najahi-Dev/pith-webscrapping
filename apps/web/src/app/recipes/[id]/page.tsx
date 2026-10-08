'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Play,
  Clock,
  Layers,
  Code2,
  Bell,
  ArrowLeft,
  Key,
  Copy,
  Check,
  Download,
  Terminal,
  RefreshCw,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { Button, DiffViewer } from '@pith/ui';
import { pithApi, RecipeResponse, ChangeRecord } from '@/lib/api';

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const recipeId = resolvedParams.id;

  const [recipe, setRecipe] = useState<RecipeResponse | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'runs' | 'changes' | 'api' | 'config'>('runs');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rec, rList, cList] = await Promise.all([
        pithApi.getRecipe(recipeId),
        pithApi.getRecipeRuns(recipeId, 30),
        pithApi.getRecipeChanges(recipeId, 30),
      ]);
      setRecipe(rec);
      setRuns(rList);
      setChanges(cList);
    } catch (err) {
      console.error('Failed to load recipe details', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [recipeId]);

  const handleRunNow = async () => {
    if (!recipe) return;
    setRunning(true);
    try {
      await pithApi.runRecipe(recipe.id);
      alert(`Recipe "${recipe.name}" triggered! Checking for changes...`);
      await loadData();
    } catch (err: any) {
      alert(`Failed to run: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (loading || !recipe) {
    return (
      <div className="p-16 text-center text-zinc-500 font-mono text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
        Loading recipe...
      </div>
    );
  }

  const publicApiUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/v1/r/${recipe.slug}/data` : `/api/v1/r/${recipe.slug}/data`;

  const curlSnippet = `curl -X GET "${publicApiUrl}?format=json" \\
  -H "Accept: application/json"${recipe.api_key_required ? ' \\\n  -H "X-Api-Key: pith_live_YOUR_KEY"' : ''}`;

  const sdkSnippet = `import { PithClient } from '@pith/sdk';

const pith = new PithClient();
const dataset = await pith.getPublicData('${recipe.slug}');
console.log(dataset.data);`;

  return (
    <div className="space-y-6 font-mono pb-16">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/recipes" className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-zinc-100">{recipe.name}</h1>
              <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 rounded">
                {recipe.method.toUpperCase()}
              </span>
            </div>
            <div className="text-xs text-zinc-400 truncate max-w-lg mt-0.5">{recipe.url}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunNow}
            loading={running}
            icon={<Play className="w-3.5 h-3.5" />}
          >
            Run Now
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} icon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
          <div className="text-[10px] uppercase text-zinc-500 font-semibold">Schedule</div>
          <div className="text-sm font-bold text-zinc-200 mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            {recipe.schedule_cron || 'manual'}
          </div>
        </div>

        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
          <div className="text-[10px] uppercase text-zinc-500 font-semibold">Last Status</div>
          <div className="text-sm font-bold text-emerald-400 mt-0.5 uppercase">
            {recipe.last_status || 'Never Run'}
          </div>
        </div>

        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
          <div className="text-[10px] uppercase text-zinc-500 font-semibold">Last Rows Count</div>
          <div className="text-sm font-bold text-zinc-200 mt-0.5">{recipe.last_row_count || 0}</div>
        </div>

        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
          <div className="text-[10px] uppercase text-zinc-500 font-semibold">Public Slug</div>
          <div className="text-xs font-bold text-cyan-400 mt-1 truncate">{recipe.slug}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('runs')}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all ${
            activeTab === 'runs'
              ? 'bg-zinc-800 text-emerald-400 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Run History ({runs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('changes')}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 ${
            activeTab === 'changes'
              ? 'bg-zinc-800 text-amber-400 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Change Diffs ({changes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('api')}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 ${
            activeTab === 'api'
              ? 'bg-zinc-800 text-cyan-400 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Public API Feed</span>
        </button>
      </div>

      {/* Tab: Run History */}
      {activeTab === 'runs' && (
        <div className="border border-zinc-800 bg-zinc-950 rounded overflow-hidden">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
              <tr>
                <th className="p-3">Job ID</th>
                <th className="p-3">Status</th>
                <th className="p-3">Rows</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500 italic">
                    No run history yet. Click 'Run Now' to execute this scraper.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-3 font-mono text-cyan-400">{r.id.slice(0, 8)}</td>
                    <td className="p-3">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] uppercase font-bold rounded ${
                          r.status === 'completed'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-zinc-100">{r.row_count}</td>
                    <td className="p-3 text-zinc-400">{r.duration_ms}ms</td>
                    <td className="p-3 text-zinc-500">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <a
                        href={`/api/v1/jobs/${r.id}/export?format=csv`}
                        download
                        className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        CSV
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Change Diffs */}
      {activeTab === 'changes' && (
        <div className="space-y-4">
          {changes.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-zinc-800 rounded bg-zinc-950 text-zinc-500 text-xs">
              No change diffs recorded yet. Change records are computed when subsequent runs detect new, removed, or modified data rows.
            </div>
          ) : (
            changes.map((c) => (
              <div key={c.id} className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Diff run recorded at {new Date(c.created_at || '').toLocaleString()}</span>
                  <span className="text-zinc-500">
                    +{c.added_count} / -{c.removed_count} / ~{c.modified_count} changes
                  </span>
                </div>
                <DiffViewer
                  addedRows={c.diff_summary?.added_rows || []}
                  removedRows={c.diff_summary?.removed_rows || []}
                  modifiedRows={c.diff_summary?.modified_rows || []}
                  alerts={c.alert_messages || []}
                  keyField={c.diff_summary?.key_field}
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Public API Feed */}
      {activeTab === 'api' && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded space-y-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Public Live Data Endpoint</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Every recipe can serve its latest successful dataset directly as a JSON or CSV REST endpoint.
              </p>
            </div>

            <div className="flex items-center gap-2 p-2 bg-zinc-950 border border-zinc-800 rounded text-xs">
              <span className="text-emerald-400 font-bold uppercase text-[10px]">GET</span>
              <code className="text-zinc-200 flex-1 truncate">{publicApiUrl}?format=json</code>
              <Button
                variant="outline"
                size="xs"
                onClick={() => copyToClipboard(`${publicApiUrl}?format=json`)}
                icon={copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              >
                {copiedCode ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          {/* cURL Example */}
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 uppercase font-semibold">
              <span>cURL Snippet</span>
              <button
                type="button"
                onClick={() => copyToClipboard(curlSnippet)}
                className="hover:text-zinc-200 flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>
            <pre className="p-3 bg-zinc-900 rounded text-xs text-emerald-400 overflow-x-auto border border-zinc-800">
              {curlSnippet}
            </pre>
          </div>

          {/* TypeScript SDK Example */}
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 uppercase font-semibold">
              <span>TypeScript / Node.js SDK</span>
              <button
                type="button"
                onClick={() => copyToClipboard(sdkSnippet)}
                className="hover:text-zinc-200 flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>
            <pre className="p-3 bg-zinc-900 rounded text-xs text-cyan-400 overflow-x-auto border border-zinc-800">
              {sdkSnippet}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
