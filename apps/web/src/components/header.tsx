'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Terminal, Database, Bookmark, Code2, Settings, ShieldCheck, Sun, Moon, Coffee, HelpCircle } from 'lucide-react';
import { GuideModal } from './guide-modal';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');
  const [isGuideOpen, setIsGuideOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('pith_theme') as 'dark' | 'light' | null;
      if (savedTheme) {
        setTheme(savedTheme);
        applyTheme(savedTheme);
      } else {
        applyTheme('dark');
      }

      // Check if first-time user to automatically open guide
      const guideSeen = localStorage.getItem('pith_guide_seen');
      if (!guideSeen) {
        setIsGuideOpen(true);
      }
    } catch (e) {
      console.warn('Storage unavailable', e);
    }
  }, []);

  const applyTheme = (nextTheme: 'dark' | 'light') => {
    const root = document.documentElement;
    if (nextTheme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      localStorage.setItem('pith_theme', nextTheme);
    } catch (e) {}
  };

  const navLinks = [
    { href: '/', label: 'Studio', icon: <Terminal className="w-3.5 h-3.5" /> },
    { href: '/recipes', label: 'Recipes', icon: <Bookmark className="w-3.5 h-3.5" /> },
    { href: '/api-docs', label: 'API & SDK', icon: <Code2 className="w-3.5 h-3.5" /> },
    { href: '/settings', label: 'Config', icon: <Settings className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur font-mono select-none">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded overflow-hidden bg-black border border-emerald-500/30 flex items-center justify-center group-hover:border-emerald-500 transition-colors p-0.5 shadow-sm">
              <Image
                src="/logo.png"
                alt="pith logo"
                width={28}
                height={28}
                className="w-full h-full object-contain rounded"
                priority
              />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm tracking-wider text-zinc-100 uppercase">pith</span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">v1.0</span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all ${
                    isActive
                      ? 'bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                  }`}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Status & Controls */}
        <div className="flex items-center gap-2.5">
          {/* Guide Button */}
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 border border-zinc-800 hover:border-zinc-700 rounded text-xs font-semibold transition-all group shadow-sm"
            title="Open Step-by-Step Guide"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Guide</span>
          </button>

          <a
            href="https://buymeacoffee.com/najahi"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/50 rounded text-xs font-semibold transition-all group shadow-sm"
            title="Buy me a coffee"
          >
            <Coffee className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Buy Me a Coffee</span>
          </a>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-[11px] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>API Online</span>
          </div>

          {/* GitHub Repository Link */}
          <a
            href="https://github.com/Najahi-Dev/pith-webscrapping"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors group"
            title="GitHub Repository (Najahi-Dev/pith-webscrapping)"
          >
            <svg className="w-3.5 h-3.5 fill-current group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Guide Interactive Modal */}
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </header>
  );
};
