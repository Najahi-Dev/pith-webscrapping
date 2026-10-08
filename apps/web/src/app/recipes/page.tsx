'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Play,
  Copy,
  Trash2,
  ExternalLink,
  Clock,
  Layers,
  Search,
  Plus,
  RefreshCw,
  Code2,
  X,
} from 'lucide-react';
import { Button } from '@pith/ui';
import { pithApi, RecipeResponse } from '@/lib/api';

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<RecipeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [runningRecipeId, setRunningRecipeId] = useState<string | null>(null);

  const fetchRecipes = async () => {
    setLoading(true);
    try {
      const data = await pithApi.listRecipes(100);
      setRecipes(data);
    } catch (err) {
      console.error('Failed to load recipes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleRunNow = async (id: string, name: string) => {
    setRunningRecipeId(id);
    try {
      await pithApi.runRecipe(id);
      alert(`Recipe "${name}" started in background!`);
      await fetchRecipes();
    } catch (err: any) {
      alert(`Failed to trigger run: ${err.message}`);
    } finally {
      setRunningRecipeId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const resp = await fetch(`/api/v1/recipes/${id}/duplicate`, { method: 'POST' });
      if (resp.ok) {
        await fetchRecipes();
      }
    } catch (err) {
      console.error('Duplicate failed', err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete recipe "${name}"?`)) return;
    try {
      await pithApi.deleteRecipe(id);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const filtered = recipes.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.url.toLowerCase().includes(search.toLowerCase()) ||
      r.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-zinc-100">Saved Scraper Recipes</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Automated crawlers, scheduled jobs, change diff alerts, and public API feeds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
              New Recipe
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={fetchRecipes} icon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Search filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md flex items-center bg-zinc-950 border border-zinc-700/80 hover:border-zinc-500 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 rounded-md px-3 h-9 transition-all duration-200 shadow-inner group">
          <Search className="w-3.5 h-3.5 text-zinc-500 group-focus-within:text-emerald-400 shrink-0 mr-2.5 transition-colors" />
          <input
            type="text"
            placeholder="Search recipes by name, slug, or target URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs font-mono focus:outline-none text-zinc-100 placeholder:text-zinc-500"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0 ml-1.5"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
        <span className="text-xs font-mono text-zinc-500">{filtered.length} total recipes</span>
      </div>

      {/* Recipe List */}
      {loading ? (
        <div className="p-12 text-center text-zinc-500 text-xs">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
          Loading recipes...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-zinc-800 rounded bg-zinc-950/40 text-zinc-500 text-xs space-y-3">
          <Bookmark className="w-8 h-8 mx-auto text-zinc-700" />
          <div>No recipes found matching query.</div>
          <Link href="/">
            <Button variant="outline" size="xs">
              Create Your First Recipe
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((recipe) => (
            <div
              key={recipe.id}
              className="p-4 bg-zinc-900/50 border border-zinc-800 rounded hover:border-zinc-700 transition-all space-y-3 font-mono"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/recipes/${recipe.id}`}
                    className="text-sm font-bold text-zinc-100 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                  >
                    <span>{recipe.name}</span>
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                  </Link>
                  <div className="text-[11px] text-zinc-400 truncate max-w-sm mt-0.5">{recipe.url}</div>
                </div>

                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700 rounded">
                  {recipe.method.toUpperCase()}
                </span>
              </div>

              {recipe.description && (
                <p className="text-xs text-zinc-400 line-clamp-2">{recipe.description}</p>
              )}

              {/* Status and Metrics Strip */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/80">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>Schedule:</span>
                  <span className="text-zinc-200 font-semibold">{recipe.schedule_cron || 'manual'}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-emerald-400" />
                  <span>Last Rows:</span>
                  <span className="text-zinc-200 font-semibold">{recipe.last_row_count || 0}</span>
                </div>

                {recipe.last_status && (
                  <span
                    className={`px-1.5 py-0.2 text-[9px] uppercase font-bold rounded ${
                      recipe.last_status === 'completed'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {recipe.last_status}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Code2 className="w-3 h-3" />
                  <span>Details & API</span>
                </Link>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => handleRunNow(recipe.id, recipe.name)}
                    loading={runningRecipeId === recipe.id}
                    icon={<Play className="w-3 h-3" />}
                  >
                    Run Now
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleDuplicate(recipe.id)}
                    title="Duplicate recipe"
                    icon={<Copy className="w-3 h-3" />}
                  />
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => handleDelete(recipe.id, recipe.name)}
                    title="Delete recipe"
                    icon={<Trash2 className="w-3 h-3" />}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
