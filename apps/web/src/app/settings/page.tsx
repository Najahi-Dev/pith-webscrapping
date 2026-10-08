'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Key,
  Sparkles,
  Shield,
  Save,
  Plus,
  Copy,
  Check,
  Trash2,
  Cpu,
  Sliders,
  RotateCcw,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@pith/ui';

const DEFAULT_USER_AGENT = 'PithBot/1.0 (+https://github.com/pith-systems/pith; contact: bot@pith.dev)';

interface SystemSettings {
  userAgent: string;
  defaultEngine: 'http' | 'playwright';
  defaultTimeout: number;
  defaultMaxPages: number;
  cleanWhitespace: boolean;
  removeDuplicates: boolean;
  normalizePrices: boolean;
  normalizeDates: boolean;
  makeUrlsAbsolute: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  aiApiKey: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  userAgent: DEFAULT_USER_AGENT,
  defaultEngine: 'http',
  defaultTimeout: 30,
  defaultMaxPages: 5,
  cleanWhitespace: true,
  removeDuplicates: true,
  normalizePrices: true,
  normalizeDates: true,
  makeUrlsAbsolute: true,
  aiEnabled: false,
  aiProvider: 'openai',
  aiApiKey: '',
};

export default function SettingsPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAiApiKey, setShowAiApiKey] = useState(false);

  // Settings State
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Load Settings from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pith_system_settings');
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.warn('Failed to load settings from storage', e);
    }
  }, []);

  const updateSetting = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setSaveSuccess(false);
  };

  const handleSaveSettings = () => {
    setIsSaving(true);
    try {
      localStorage.setItem('pith_system_settings', JSON.stringify(settings));
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to save settings', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    setIsDirty(true);
    setSaveSuccess(false);
  };

  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const resp = await fetch('/api/v1/keys');
      if (resp.ok) {
        const data = await resp.json();
        setKeys(data);
      }
    } catch (err) {
      console.error('Failed to fetch keys', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const resp = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (resp.ok) {
        setNewKeyName('');
        await fetchKeys();
      }
    } catch (err) {
      console.error('Failed to create key', err);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    setDeletingKeyId(keyId);
    try {
      const resp = await fetch(`/api/v1/keys/${keyId}`, {
        method: 'DELETE',
      });
      if (resp.ok) {
        await fetchKeys();
      }
    } catch (err) {
      console.error('Failed to delete key', err);
    } finally {
      setDeletingKeyId(null);
    }
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-8 font-mono pb-20">
      {/* Page Header & Save Bar */}
      <div className="border-b border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400">
            <Settings className="w-5 h-5" />
            <h1 className="text-xl font-bold text-zinc-100">System Configuration</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage API keys, crawler User-Agents, pipeline defaults, and AI suggestions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Saved!</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveSettings}
            loading={isSaving}
            disabled={!isDirty && !saveSuccess}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            {isDirty ? 'Save Changes' : 'Saved'}
          </Button>
        </div>
      </div>

      {/* Section 1: API Keys */}
      <div className="p-5 bg-zinc-900/40 border border-zinc-800 rounded space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-400" />
            API Key Management
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            API keys allow external applications and automations to fetch live recipe datasets securely.
          </p>
        </div>

        {/* Generate Key Form */}
        <form onSubmit={handleCreateKey} className="flex items-center gap-2 max-w-md">
          <input
            type="text"
            placeholder="Key name (e.g. Production Analytics)..."
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 h-8 px-2.5 bg-zinc-950 text-xs text-zinc-100 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <Button
            type="submit"
            variant="primary"
            size="xs"
            loading={creatingKey}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Generate Key
          </Button>
        </form>

        {/* Keys List */}
        <div className="space-y-2 pt-2">
          {loadingKeys ? (
            <div className="text-xs text-zinc-500">Loading API keys...</div>
          ) : keys.length === 0 ? (
            <div className="p-4 text-center border border-dashed border-zinc-800 rounded text-zinc-500 text-xs">
              No API keys created yet.
            </div>
          ) : (
            keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800 rounded text-xs"
              >
                <div>
                  <div className="font-semibold text-zinc-200">{k.name}</div>
                  <code className="text-cyan-400 text-[11px]">{k.key}</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">{k.rate_limit_per_minute} req/min</span>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => copyText(k.id, k.key)}
                    icon={copiedKey === k.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  >
                    {copiedKey === k.id ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => handleDeleteKey(k.id)}
                    loading={deletingKeyId === k.id}
                    icon={<Trash2 className="w-3 h-3" />}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 2: Engine Defaults & Performance */}
      <div className="p-5 bg-zinc-900/40 border border-zinc-800 rounded space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Engine Defaults & Performance
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure default crawler engines, request timeouts, and pagination thresholds.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 uppercase font-semibold">Default Engine</label>
            <select
              value={settings.defaultEngine}
              onChange={(e) => updateSetting('defaultEngine', e.target.value as 'http' | 'playwright')}
              className="w-full h-8 px-2 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="http">Fast HTTP (httpx)</option>
              <option value="playwright">Playwright JS (Chromium)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 uppercase font-semibold">Request Timeout (sec)</label>
            <input
              type="number"
              min={5}
              max={120}
              value={settings.defaultTimeout}
              onChange={(e) => updateSetting('defaultTimeout', parseInt(e.target.value, 10) || 30)}
              className="w-full h-8 px-2.5 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 uppercase font-semibold">Default Max Pages</label>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.defaultMaxPages}
              onChange={(e) => updateSetting('defaultMaxPages', parseInt(e.target.value, 10) || 5)}
              className="w-full h-8 px-2.5 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Data Cleaning Defaults */}
      <div className="p-5 bg-zinc-900/40 border border-zinc-800 rounded space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            Data Cleaning Pipeline Defaults
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Rules automatically applied to extracted table rows before exporting.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs text-zinc-300">
          <label className="flex items-center gap-2.5 cursor-pointer p-2 bg-zinc-950/60 border border-zinc-800/80 rounded hover:border-zinc-700">
            <input
              type="checkbox"
              checked={settings.cleanWhitespace}
              onChange={(e) => updateSetting('cleanWhitespace', e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Trim extra whitespace & normalize linebreaks</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer p-2 bg-zinc-950/60 border border-zinc-800/80 rounded hover:border-zinc-700">
            <input
              type="checkbox"
              checked={settings.removeDuplicates}
              onChange={(e) => updateSetting('removeDuplicates', e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Remove duplicate rows automatically</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer p-2 bg-zinc-950/60 border border-zinc-800/80 rounded hover:border-zinc-700">
            <input
              type="checkbox"
              checked={settings.normalizePrices}
              onChange={(e) => updateSetting('normalizePrices', e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Normalize currency amounts to numeric floats</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer p-2 bg-zinc-950/60 border border-zinc-800/80 rounded hover:border-zinc-700">
            <input
              type="checkbox"
              checked={settings.normalizeDates}
              onChange={(e) => updateSetting('normalizeDates', e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Convert ambiguous dates into ISO 8601 strings</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer p-2 bg-zinc-950/60 border border-zinc-800/80 rounded hover:border-zinc-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.makeUrlsAbsolute}
              onChange={(e) => updateSetting('makeUrlsAbsolute', e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Make relative links and image paths absolute URLs</span>
          </label>
        </div>
      </div>

      {/* Section 4: Polite User-Agent & Safety */}
      <div className="p-5 bg-zinc-900/40 border border-zinc-800 rounded space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          Polite Crawler Identity
        </h2>
        <p className="text-xs text-zinc-400">
          Identifies Pith to target servers with contact details in compliance with ethical crawling standards.
        </p>
        <input
          type="text"
          value={settings.userAgent}
          onChange={(e) => updateSetting('userAgent', e.target.value)}
          className="w-full h-8 px-2.5 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Section 5: Optional AI Field Naming */}
      <div className="p-5 bg-zinc-900/40 border border-zinc-800 rounded space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            Optional AI Field Tagging (Disabled by Default)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Suggests normalized column names for unstructured pages using small sample snippets (max 2KB).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="ai_toggle"
            checked={settings.aiEnabled}
            onChange={(e) => updateSetting('aiEnabled', e.target.checked)}
            className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
          />
          <label htmlFor="ai_toggle" className="text-xs text-zinc-300 font-semibold cursor-pointer select-none">
            Enable AI Field Suggestions
          </label>
        </div>

        {settings.aiEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 uppercase font-semibold">Provider</label>
              <select
                value={settings.aiProvider}
                onChange={(e) => updateSetting('aiProvider', e.target.value)}
                className="w-full h-8 px-2 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="openai">OpenAI (gpt-4o-mini)</option>
                <option value="anthropic">Anthropic (Claude 3.5 Haiku)</option>
                <option value="gemini">Google Gemini 1.5 Flash</option>
                <option value="groq">Groq (Llama 3.3)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 uppercase font-semibold">API Key</label>
              <div className="relative flex items-center">
                <input
                  type={showAiApiKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={settings.aiApiKey}
                  onChange={(e) => updateSetting('aiApiKey', e.target.value)}
                  className="w-full h-8 pl-2.5 pr-8 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowAiApiKey(!showAiApiKey)}
                  className="absolute right-2 p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title={showAiApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showAiApiKey ? (
                    <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating/Sticky Save Action Bar */}
      <div className="p-4 bg-zinc-950/90 border border-zinc-800 rounded flex items-center justify-between backdrop-blur">
        <div className="text-xs text-zinc-400 flex items-center gap-2">
          {isDirty ? (
            <span className="text-amber-400 font-semibold">● You have unsaved changes</span>
          ) : (
            <span className="text-zinc-500">All changes saved</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset to Defaults
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveSettings}
            loading={isSaving}
            disabled={!isDirty && !saveSuccess}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            {isDirty ? 'Save Changes' : 'Saved'}
          </Button>
        </div>
      </div>
    </div>
  );
}
