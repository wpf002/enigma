import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { Search } from '@/components/Search';
import { ThemeToggle } from '@/components/ThemeToggle';
import { api } from '@/lib/api';
import type { Overview } from '@/lib/types';
import './globals.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

// Every page reads the claim store through the API at request time. Nothing is prerendered at build.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Enigma', template: '%s · Enigma' },
  description: 'A contradiction engine for structured clinical evidence.',
};

// Applies the stored theme before first paint.
const THEME_SCRIPT = `try{var t=localStorage.getItem('enigma-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const overview = await api<Overview>('/v1/overview').catch(() => null);
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="btn sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50">Skip to content</a>
        <div className="lg:grid lg:min-h-screen lg:grid-cols-[256px_minmax(0,1fr)]">
          <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col gap-6 px-4 py-6">
              <Link href="/" className="flex items-baseline gap-2 px-3">
                <span className="text-lg font-bold">Enigma</span>
                <span className="eyebrow">v1</span>
              </Link>
              <Search />
              <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Primary">
                <NavLink href="/">Overview</NavLink>
                <NavLink href="/contradictions" count={undefined}>Contradictions</NavLink>
                <NavLink href="/map">Contradiction map</NavLink>
                <NavLink href="/endpoints">Evidence timeline</NavLink>
                <NavLink href="/failures">Not comparable</NavLink>
                <NavLink href="/watchlists" count={overview?.counts.unreadAlerts}>Watchlists</NavLink>
                <NavLink href="/status">Gates and rules</NavLink>
              </nav>
              <div className="mt-auto hidden flex-col gap-4 lg:flex">
                {overview && (
                  <div className="px-3 text-xs text-muted">
                    <p className="eyebrow mb-1">Snapshot</p>
                    <p className="break-all font-mono text-text">{overview.snapshot.aactVersion}</p>
                    <p className="mt-1">{overview.snapshot.source === 'AACT_DUMP' ? 'AACT dump' : 'ClinicalTrials.gov API subset'}</p>
                    <p className="num">{overview.snapshot.studyCount.toLocaleString('en-US')} trials</p>
                  </div>
                )}
                <ThemeToggle />
              </div>
            </div>
          </aside>
          <main id="main" className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
            <div className="mx-auto max-w-page">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
