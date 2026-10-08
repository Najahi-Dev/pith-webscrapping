import React, { useState, useEffect, useRef } from 'react';
import { MousePointer, Box, Plus, Trash2, Tag, RefreshCw, Eye } from 'lucide-react';
import { Button } from './Button';

export interface SelectedField {
  name: string;
  selector: string;
  attribute: string;
  sampleText?: string;
  tag?: string;
}

export interface VisualPickerFrameProps {
  previewHtml: string;
  targetUrl: string;
  initialContainer?: string;
  initialFields?: Record<string, string | { selector: string; attribute?: string }>;
  onChange?: (container: string | undefined, fields: SelectedField[]) => void;
  className?: string;
}

export const VisualPickerFrame: React.FC<VisualPickerFrameProps> = ({
  previewHtml,
  targetUrl,
  initialContainer = '',
  initialFields = {},
  onChange,
  className = '',
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mode, setMode] = useState<'field' | 'container'>('field');
  const [containerSelector, setContainerSelector] = useState(initialContainer);
  const [fields, setFields] = useState<SelectedField[]>(() => {
    return Object.entries(initialFields).map(([name, val]) => {
      if (typeof val === 'string') {
        return { name, selector: val, attribute: 'text' };
      }
      return { name, selector: val.selector, attribute: val.attribute || 'text' };
    });
  });
  const [hoveredInfo, setHoveredInfo] = useState<any>(null);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'pith:element_selected') {
        if (data.mode === 'container') {
          setContainerSelector(data.selector);
          // Post highlight to iframe
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'pith:highlight_container', selector: data.selector },
            '*'
          );
        } else {
          // Field selection
          const defaultName = data.tag === 'img' ? 'image' : data.tag === 'a' ? 'link' : `field_${fields.length + 1}`;
          const attr = data.tag === 'img' ? 'src' : data.tag === 'a' ? 'href' : 'text';
          const newField: SelectedField = {
            name: defaultName,
            selector: data.selector,
            attribute: attr,
            sampleText: data.text || data.src || data.href || '',
            tag: data.tag,
          };
          setFields((prev) => [...prev, newField]);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fields.length]);

  useEffect(() => {
    if (onChange) {
      onChange(containerSelector || undefined, fields);
    }
  }, [containerSelector, fields, onChange]);

  const handleModeChange = (newMode: 'field' | 'container') => {
    setMode(newMode);
    iframeRef.current?.contentWindow?.postMessage({ type: 'pith:set_mode', mode: newMode }, '*');
  };

  const handleRemoveField = (idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRenameField = (idx: number, newName: string) => {
    setFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, name: newName } : f))
    );
  };

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 font-mono ${className}`}>
      {/* Interactive Sandboxed Visual Iframe */}
      <div className="lg:col-span-2 border border-zinc-800 rounded bg-zinc-950 overflow-hidden flex flex-col h-[600px]">
        {/* Frame Toolbar */}
        <div className="flex items-center justify-between p-2.5 bg-zinc-900 border-b border-zinc-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-bold uppercase text-[10px]">Mode:</span>
            <div className="flex rounded border border-zinc-700 bg-zinc-800/80 p-0.5">
              <button
                type="button"
                onClick={() => handleModeChange('field')}
                className={`px-2.5 py-1 text-[11px] rounded font-semibold transition-all ${
                  mode === 'field' ? 'bg-emerald-500 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Pick Field
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('container')}
                className={`px-2.5 py-1 text-[11px] rounded font-semibold transition-all ${
                  mode === 'container' ? 'bg-amber-500 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Pick Container
              </button>
            </div>
          </div>

          <span className="text-[11px] text-zinc-400 truncate max-w-xs">{targetUrl}</span>
        </div>

        {/* Sandboxed iframe */}
        <div className="flex-1 bg-white relative">
          <iframe
            ref={iframeRef}
            srcDoc={previewHtml}
            sandbox="allow-same-origin allow-scripts"
            title="Pith Sandboxed Visual Inspector"
            className="w-full h-full border-0"
          />
        </div>
      </div>

      {/* Visual Inspector Control Panel */}
      <div className="border border-zinc-800 rounded bg-zinc-900/60 p-4 space-y-4 h-[600px] overflow-y-auto flex flex-col">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 mb-1">Visual Selector Kit</div>
          <p className="text-[11px] text-zinc-400">
            Hover over elements in the sandboxed preview and click to capture fields automatically.
          </p>
        </div>

        {/* Container Selector Section */}
        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5" />
              Row Container Selector
            </span>
            {containerSelector && (
              <button
                type="button"
                onClick={() => setContainerSelector('')}
                className="text-[10px] text-zinc-500 hover:text-rose-400"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="text"
            value={containerSelector}
            onChange={(e) => setContainerSelector(e.target.value)}
            placeholder="e.g. .product-card or tr"
            className="w-full h-8 px-2 text-xs font-mono bg-zinc-900 text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Selected Fields List */}
        <div className="flex-1 space-y-2.5 overflow-y-auto">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-300">
            <span>Captured Fields ({fields.length})</span>
          </div>

          {fields.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-zinc-800 rounded text-zinc-500 text-xs italic">
              No fields selected yet. Click any element inside the page preview to add it.
            </div>
          ) : (
            fields.map((f, idx) => (
              <div key={idx} className="p-2.5 bg-zinc-950 border border-zinc-800 rounded space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={f.name}
                    onChange={(e) => handleRenameField(idx, e.target.value)}
                    className="h-6 px-1.5 text-xs font-bold font-mono bg-zinc-900 text-emerald-400 border border-zinc-700/80 rounded w-28 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded uppercase">
                    {f.attribute}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveField(idx)}
                    className="text-zinc-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-[10.5px] text-zinc-400 font-mono truncate">
                  <code className="text-zinc-300">{f.selector}</code>
                </div>

                {f.sampleText && (
                  <div className="text-[10px] text-zinc-500 truncate bg-zinc-900 px-1.5 py-0.5 rounded">
                    Sample: {f.sampleText}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
