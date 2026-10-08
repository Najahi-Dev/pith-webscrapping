'use client';

import React, { useState } from 'react';
import { Code2, Terminal, Layers, Play, Copy, Check, ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '@pith/ui';

export default function ApiDocsPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const endpoints = [
    {
      method: 'POST',
      path: '/v1/check',
      desc: 'Validates URL against SSRF, tests robots.txt compliance, checks bot defenses/login walls, and computes scrapability score (0-100).',
      body: '{\n  "url": "https://example.com/catalog"\n}',
    },
    {
      method: 'POST',
      path: '/v1/detect',
      desc: 'Discovers DOM structures: repeating sibling cards, HTML tables, JSON-LD schemas, links, images, emails, and prices with 3 sample rows.',
      body: '{\n  "url": "https://example.com/catalog",\n  "method": "http"\n}',
    },
    {
      method: 'POST',
      path: '/v1/preview',
      desc: 'Generates sandboxed HTML snapshot with script stripping and postMessage inspector bridge for visual picking.',
      body: '{\n  "url": "https://example.com/catalog"\n}',
    },
    {
      method: 'POST',
      path: '/v1/jobs',
      desc: 'Starts asynchronous data extraction job with pagination, data cleaning, and deduplication pipeline.',
      body: '{\n  "url": "https://example.com/catalog",\n  "method": "http",\n  "pagination": { "enabled": true, "max_pages": 3 },\n  "cleaning_rules": {\n    "trim_whitespace": true,\n    "remove_duplicates": true,\n    "normalize_prices": true\n  }\n}',
    },
    {
      method: 'GET',
      path: '/v1/jobs/{id}',
      desc: 'Fetches extraction status, live page progress, extracted row counts, and column definitions.',
      body: null,
    },
    {
      method: 'GET',
      path: '/v1/jobs/{id}/export?format=csv|json|xlsx',
      desc: 'Streams full extracted dataset as CSV, JSON, or Microsoft Excel (.xlsx) file.',
      body: null,
    },
    {
      method: 'GET',
      path: '/v1/r/{slug}/data?format=json|csv&page=1&limit=50',
      desc: 'Public recipe data endpoint returning the latest successful crawler run.',
      body: null,
    },
  ];

  return (
    <div className="space-y-8 font-mono pb-16">
      {/* Page Title */}
      <div className="border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <Code2 className="w-5 h-5" />
          <h1 className="text-xl font-bold text-zinc-100">API & TypeScript SDK Reference</h1>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Complete REST API documentation, CLI commands, and TypeScript SDK integration guides.
        </p>
      </div>

      {/* CLI Section */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          CLI Command Quickstart
        </h2>
        <div className="p-4 bg-zinc-950 border border-zinc-800 rounded space-y-3">
          <div className="text-xs text-zinc-400">
            Run the Pith CLI directly without global installation via <code className="text-emerald-400">npx @pith/sdk</code>:
          </div>

          <div className="space-y-2">
            {[
              { cmd: 'npx pith check https://news.ycombinator.com', label: '1. Check safety & score' },
              { cmd: 'npx pith detect https://news.ycombinator.com', label: '2. Auto-detect structures' },
              { cmd: 'npx pith run https://news.ycombinator.com --pages 2 --output hn.json', label: '3. Run job & save' },
              { cmd: 'npx pith export <job_id> --format csv --output dump.csv', label: '4. Export dataset' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-zinc-900 border border-zinc-800 rounded text-xs"
              >
                <div>
                  <span className="text-[10px] text-zinc-500 block">{item.label}</span>
                  <code className="text-zinc-200">{item.cmd}</code>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => copyText(`cli_${idx}`, item.cmd)}
                  icon={copiedKey === `cli_${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                >
                  {copiedKey === `cli_${idx}` ? 'Copied' : 'Copy'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* REST API Reference */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          FastAPI REST Endpoints
        </h2>

        <div className="space-y-3">
          {endpoints.map((ep, idx) => (
            <div key={idx} className="p-4 bg-zinc-900/40 border border-zinc-800 rounded space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                      ep.method === 'POST' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-blue-950 text-blue-400 border border-blue-800'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <code className="text-zinc-100 font-semibold">{ep.path}</code>
                </div>
              </div>

              <p className="text-xs text-zinc-400">{ep.desc}</p>

              {ep.body && (
                <div className="pt-1">
                  <div className="text-[10px] uppercase font-semibold text-zinc-500 mb-1">Request Body Example:</div>
                  <pre className="p-2.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-emerald-400 overflow-x-auto">
                    {ep.body}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
