'use client';

import React, { useState } from 'react';
import { Bookmark, X, Clock, Shield, Sliders, Check } from 'lucide-react';
import { Button } from '@pith/ui';
import { pithApi, RecipeCreateParams } from '@/lib/api';

export interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  method: 'http' | 'playwright';
  categoryId?: string;
  selectors?: Record<string, any>;
  pagination?: { enabled: boolean; max_pages: number };
  cleaningRules?: any;
  onSaved?: (recipe: any) => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  isOpen,
  onClose,
  url,
  method,
  categoryId,
  selectors,
  pagination,
  cleaningRules,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('manual');
  const [keyField, setKeyField] = useState('auto');
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Recipe name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: RecipeCreateParams = {
        name: name.trim(),
        description: description.trim() || undefined,
        url,
        method,
        category_id: categoryId,
        selectors,
        pagination,
        cleaning_rules: cleaningRules,
        schedule_cron: schedule,
        alert_rules: {
          notify_on_change: true,
          key_field: keyField === 'auto' ? undefined : keyField,
          rules: [{ type: 'price_dropped' }, { type: 'new_item' }],
        },
        api_key_required: apiKeyRequired,
      };

      const recipe = await pithApi.createRecipe(payload);
      if (onSaved) onSaved(recipe);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save recipe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm font-mono">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-100">Save as Scraper Recipe</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-4 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 bg-rose-950/60 border border-rose-900 rounded text-rose-400">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase">Recipe Name *</label>
            <input
              type="text"
              placeholder="e.g. Daily TechGear Keyboard Scraper"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-8 px-2.5 bg-zinc-900 text-zinc-100 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase">Description (Optional)</label>
            <textarea
              placeholder="Extracts product titles, prices, and stock from catalog..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full p-2 bg-zinc-900 text-zinc-100 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                Schedule
              </label>
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="w-full h-8 px-2 bg-zinc-900 text-zinc-100 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="manual">Manual (On-Demand)</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily (Midnight)</option>
                <option value="weekly">Weekly (Monday)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase flex items-center gap-1">
                <Sliders className="w-3 h-3 text-amber-400" />
                Change Hash Key
              </label>
              <input
                type="text"
                placeholder="auto (or 'url', 'id')"
                value={keyField}
                onChange={(e) => setKeyField(e.target.value)}
                className="w-full h-8 px-2 bg-zinc-900 text-zinc-100 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="api_key_req"
              checked={apiKeyRequired}
              onChange={(e) => setApiKeyRequired(e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
            />
            <label htmlFor="api_key_req" className="text-zinc-300 text-[11px] select-none cursor-pointer">
              Require API Key for public <code className="text-emerald-400">/v1/r/[slug]/data</code> endpoint
            </label>
          </div>

          <div className="p-2.5 bg-zinc-900/60 border border-zinc-800 rounded text-[11px] text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-300">Configuration Snapshot:</div>
            <div>• URL: <span className="text-zinc-200 truncate">{url}</span></div>
            <div>• Engine: <span className="text-emerald-400 uppercase">{method}</span></div>
            <div>• Target: <span className="text-cyan-400">{categoryId || 'Visual Selectors'}</span></div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={loading}>
              Save Recipe
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
