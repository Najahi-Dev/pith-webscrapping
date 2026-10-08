import React, { useState } from 'react';
import { Globe, ArrowRight, X, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export interface UrlInputProps {
  initialUrl?: string;
  onSubmit: (url: string) => void;
  loading?: boolean;
  error?: string | null;
  placeholder?: string;
  disabled?: boolean;
}

export const UrlInput: React.FC<UrlInputProps> = ({
  initialUrl = '',
  onSubmit,
  loading = false,
  error = null,
  placeholder = 'https://example.com/catalog',
  disabled = false,
}) => {
  const [url, setUrl] = useState(initialUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <div className="w-full space-y-2">
      <form onSubmit={handleSubmit} className="relative flex items-center w-full">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-zinc-500">
          <Globe className="w-4 h-4 text-emerald-500" />
        </div>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="w-full h-11 pl-10 pr-36 font-mono text-sm bg-zinc-900/90 text-zinc-100 placeholder:text-zinc-600 border border-zinc-700/80 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-inner"
        />

        <div className="absolute right-1.5 flex items-center gap-2">
          {url && !loading && (
            <button
              type="button"
              onClick={() => setUrl('')}
              className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-800/60 transition-colors"
              title="Clear input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={loading}
            disabled={!url.trim() || disabled}
            icon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Inspect
          </Button>
        </div>
      </form>

      {error && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-rose-400 bg-rose-950/40 border border-rose-900/60 rounded">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
