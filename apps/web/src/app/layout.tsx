import type { Metadata } from 'next';
import '../styles/globals.css';
import { Header } from '../components/header';
import { Providers } from '../components/providers';

export const metadata: Metadata = {
  title: 'pith - Intelligent Web Scraping & Detection System',
  description: 'High-density developer platform for safe, automated, and structured web data extraction.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-[100dvh] flex flex-col bg-zinc-950 text-zinc-100 antialiased font-mono">
        <Providers>
          <Header />
          <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">{children}</main>
        </Providers>
        <footer className="border-t border-zinc-800/80 py-4 px-6 text-center text-xs text-zinc-500 font-mono">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>pith dev-tool systems • ethical scraping & automated DOM extraction</div>
            <div className="flex items-center gap-4 text-zinc-500">
              <a
                href="https://github.com/Najahi-Dev/pith-webscrapping"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-100 font-semibold transition-colors flex items-center gap-1.5"
              >
                <span>GitHub Repo</span>
              </a>
              <span className="text-zinc-700">•</span>
              <a
                href="https://buymeacoffee.com/najahi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400/90 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1.5"
              >
                <span>☕ buymeacoffee.com/najahi</span>
              </a>
              <span className="text-zinc-700">•</span>
              <span className="text-zinc-600">Obeying robots.txt & SSRF Safe Guard active</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
