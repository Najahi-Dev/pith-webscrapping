'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Key, Sparkles, Shield, RefreshCw, Plus, Copy, Check, Trash2 } from 'lucide-react';
import { Button } from '@pith/ui';

export default function SettingsPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState('openai');
  const [aiApiKey, setAiApiKey] = useState('');
  const [userAgent, setUserAgent] = useState('PithBot/1.0 (+https://github.com/pith-systems/pith; contact: bot@pith.dev)');

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

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-8 font-mono pb-16">
      {/* Page Header */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <Settings className="w-5 h-5" />
          <h1 className="text-xl font-bold text-zinc-100">System Configuration</h1>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Manage API keys for public recipe endpoints, crawler User-Agents, and optional AI suggestions.
        </p>
      </div>

      {/* Section 1: API Keys */}
      <div className="p-5 bg-zinc-900/40 border border-zinc-800 rounded space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              API Key Management
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              API keys allow external applications and automations to fetch live recipe datasets securely.
            </p>
          </div>
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
          <Button type="submit" variant="primary" size="xs" loading={creatingKey} icon={<Plus className="w-3.5 h-3.5" />}>
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
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 2: Polite User-Agent & Safety */}
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
          value={userAgent}
          onChange={(e) => setUserAgent(e.target.value)}
          className="w-full h-8 px-2.5 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded font-mono"
        />
      </div>

      {/* Section 3: Optional AI Field Naming */}
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
            checked={aiEnabled}
            onChange={(e) => setAiEnabled(e.target.checked)}
            className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
          />
          <label htmlFor="ai_toggle" className="text-xs text-zinc-300 font-semibold cursor-pointer select-none">
            Enable AI Field Suggestions
          </label>
        </div>

        {aiEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 uppercase font-semibold">Provider</label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                className="w-full h-8 px-2 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded"
              >
                <option value="openai">OpenAI (gpt-4o-mini)</option>
                <option value="anthropic">Anthropic (Claude 3.5 Haiku)</option>
                <option value="gemini">Google Gemini 1.5 Flash</option>
                <option value="groq">Groq (Llama 3.3)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 uppercase font-semibold">API Key</label>
              <input
                type="password"
                placeholder="sk-..."
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                className="w-full h-8 px-2 bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 rounded"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
