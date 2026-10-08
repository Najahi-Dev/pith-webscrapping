import type { Metadata } from 'next';
import '../styles/globals.css';
import { Header } from '../components/header';

export const metadata: Metadata = {
  title: 'pith — Intelligent Web Scraping & Detection System',
  description: 'High-density developer platform for safe, automated, and structured web data extraction.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-[100dvh] flex flex-col bg-zinc-950 text-zinc-100 antialiased font-mono">
        <Header />
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">{children}</main>
        <footer className="border-t border-zinc-800/80 py-4 px-6 text-center text-xs text-zinc-500 font-mono">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>pith dev-tool systems • ethical scraping & automated DOM extraction</div>
            <div className="text-zinc-600">Obeying robots.txt & SSRF Safe Guard active</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
