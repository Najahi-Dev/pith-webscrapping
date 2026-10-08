'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HelpCircle,
  X,
  Compass,
  Cpu,
  Key,
  Layers,
  Download,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  MousePointer,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import { Button } from '@pith/ui';

export interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GUIDE_STEPS = [
  {
    step: 1,
    badge: 'Overview',
    title: 'Welcome to Pith',
    subtitle: 'Autonomous DOM Detection & Ethical Crawling Platform',
    icon: <Compass className="w-6 h-6 text-emerald-400" />,
    description:
      'Pith is a developer-first web scraping system that inspects target URLs, computes a 0-100 Scrapability score, detects structured data patterns, and extracts clean datasets in seconds.',
    highlights: [
      { label: 'Safety First', text: 'SSRF guard & robots.txt compliance built-in.' },
      { label: 'Auto-Discovery', text: 'Instant detection of tables, cards, images, and links.' },
      { label: 'Developer SDK & CLI', text: 'Run scraping jobs directly from your terminal or TypeScript apps.' },
    ],
  },
  {
    step: 2,
    badge: 'Engine Selector',
    title: 'Fast HTTP vs Playwright JS',
    subtitle: 'Choose the optimal engine for your target website',
    icon: <Cpu className="w-6 h-6 text-cyan-400" />,
    description:
      'Pith gives you two distinct crawling engines selectable at the top right of the studio:',
    highlights: [
      {
        label: 'Fast HTTP (httpx)',
        text: 'Ultra-fast, lightweight asynchronous HTTP engine ideal for static websites, documentation, and blogs.',
      },
      {
        label: 'Playwright JS (Chromium)',
        text: 'Headless browser that renders dynamic JavaScript, client-side React/Vue SPAs, and AJAX-loaded tables.',
      },
    ],
  },
  {
    step: 3,
    badge: 'Authentication',
    title: 'Session Cookies & API Keys',
    subtitle: 'Scrape private dashboards and authenticated accounts',
    icon: <Key className="w-6 h-6 text-amber-400" />,
    description:
      'If you have authorized access to an account, you can pass your browser cookies or Bearer tokens directly:',
    highlights: [
      {
        label: 'Header Drawer',
        text: 'Click "▶ Add Custom Request Headers / API Key" right beneath the URL input bar.',
      },
      {
        label: 'Smart Cookie Parsing',
        text: 'Paste raw browser cookies (e.g. session_id=...; token=...) or Authorization headers.',
      },
      {
        label: 'Playwright Injection',
        text: 'Cookies are automatically attached to the browser context to bypass login barriers.',
      },
    ],
  },
  {
    step: 4,
    badge: 'Structure Selection',
    title: 'Categories & Visual Inspector',
    subtitle: 'Pick what data to extract with point-and-click ease',
    icon: <Layers className="w-6 h-6 text-purple-400" />,
    description:
      'Once a URL is inspected, Pith gives you two intuitive ways to extract data:',
    highlights: [
      {
        label: 'Auto-Detected Categories',
        text: 'Click any detected category card (Data Tables, Product Cards, Links, Images) with 3-row live previews.',
      },
      {
        label: 'Visual Inspector',
        text: 'Switch to the Visual Inspector mode, point and click on any element in the sandboxed preview iframe.',
      },
    ],
  },
  {
    step: 5,
    badge: 'Pipeline & Export',
    title: 'Multi-Page Pagination & Exports',
    subtitle: 'Crawl full catalogues and export formatted data',
    icon: <Download className="w-6 h-6 text-emerald-400" />,
    description:
      'Extract every record across the entire site with automated cleaning and formatting:',
    highlights: [
      {
        label: 'Multi-page Crawl',
        text: 'Check "☑ Enable Pagination" and set "Max Pages" to automatically follow Next > links.',
      },
      {
        label: 'Data Cleaning Pipeline',
        text: 'Automatic deduplication, whitespace trimming, price float conversion, and ISO dates.',
      },
      {
        label: 'Export & Automate',
        text: 'Download as CSV, JSON, or Excel (XLSX), or click "Save as Recipe" to schedule automated recurring runs!',
      },
    ],
  },
];

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const stepData = GUIDE_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === GUIDE_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem('pith_guide_seen', 'true');
      } catch (e) {}
    }
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in font-mono">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded bg-emerald-500/10 border border-emerald-500/30">
              <HelpCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Pith User Guide
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
              Step {currentStep + 1} of {GUIDE_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            onClick={handleComplete}
            className="p-1 text-zinc-400 hover:text-zinc-100 rounded hover:bg-zinc-800 transition-colors"
            title="Close Guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto max-h-[70vh]">
          {/* Step Title Header */}
          <div className="flex items-start gap-4 pb-2 border-b border-zinc-800/60">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0">
              {stepData.icon}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-emerald-400 rounded border border-zinc-700">
                  {stepData.badge}
                </span>
                <h3 className="text-base font-bold text-zinc-100">{stepData.title}</h3>
              </div>
              <p className="text-xs text-zinc-400">{stepData.subtitle}</p>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-zinc-300 leading-relaxed">{stepData.description}</p>

          {/* Highlights Card */}
          <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg space-y-2.5">
            <div className="text-[10.5px] uppercase font-bold text-zinc-400 tracking-wider">
              Key Features & Pro Tips:
            </div>
            <div className="space-y-2">
              {stepData.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-zinc-100">{h.label}:</strong>{' '}
                    <span className="text-zinc-300">{h.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Bottom Pagination & Navigation */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Dot Indicators */}
          <div className="flex items-center gap-2">
            {GUIDE_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentStep
                    ? 'w-6 bg-emerald-500'
                    : 'w-2 bg-zinc-700 hover:bg-zinc-500'
                }`}
                title={`Jump to step ${idx + 1}`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 mr-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Don't show on start</span>
            </label>

            {!isFirstStep && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                icon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Previous
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={handleNext}
              icon={
                isLastStep ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )
              }
            >
              {isLastStep ? 'Get Started' : 'Next Step'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
