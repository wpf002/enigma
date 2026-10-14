import type { Metadata } from 'next';
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconBell, IconChecklist, IconConflict, IconGate, IconMap, IconOverview, IconTimeline, IconWatch } from '@/components/icons';
import { NavLink } from '@/components/NavLink';
import { Search } from '@/components/Search';
import { ThemeToggle } from '@/components/ThemeToggle';
import { api } from '@/lib/api';
import type { Overview } from '@/lib/types';
import './globals.css';

const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-sans', display: 'swap' });
const display = Newsreader({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-display', display: 'swap', adjustFontFallback: false });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

// Every page reads the claim store through the API at request time. Nothing is prerendered at build.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Enigma', template: '%s · Enigma' },
  description: 'A contradiction engine for structured clinical evidence.',
};

// Applies the stored theme before first paint.
const THEME_SCRIPT = `try{var t=localStorage.getItem('enigma-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

/** Two intervals that do not overlap. */
function Mark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden className="text-accent">
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path d="M5 9h8M11 15h8" stroke="var(--accent-fg)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="9" r="2" fill="var(--accent-fg)" />
      <circle cx="15" cy="15" r="2" fill="var(--accent-fg)" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const overview = await api<Overview>('/v1/overview').catch(() => null);
  const unread = overview?.counts.unreadAlerts ?? 0;
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="btn sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50">Skip to Content</a>
        <div className="lg:grid lg:min-h-screen lg:grid-cols-[224px_minmax(0,1fr)]">
          <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col gap-4 px-3 py-4">
              <Link href="/" className="flex h-8 items-center gap-3 px-3">
                <Mark />
                <span className="display text-lg">Enigma</span>
              </Link>
              <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Primary">
                <NavLink href="/" icon={<IconOverview />}>Overview</NavLink>
                <NavLink href="/contradictions" icon={<IconConflict />}>Contradictions</NavLink>
                <NavLink href="/map" icon={<IconMap />}>Map</NavLink>
                <NavLink href="/endpoints" icon={<IconTimeline />}>Timeline</NavLink>
                <NavLink href="/mismatches" icon={<IconGate />}>Mismatches</NavLink>
                <NavLink href="/watchlists" icon={<IconWatch />} count={unread}>Watchlists</NavLink>
                <NavLink href="/validation" icon={<IconChecklist />}>Validation</NavLink>
              </nav>
            </div>
          </aside>
          <div className="min-w-0">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-bg px-4 sm:px-8 lg:px-12">
              <Search />
              <div className="ml-auto flex items-center gap-1">
                <Link href="/watchlists" className="btn relative border-transparent bg-transparent px-2 text-muted" aria-label={`Alerts, ${unread} Unread`} title="Alerts">
                  <IconBell />
                  {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
                </Link>
                <ThemeToggle />
              </div>
            </header>
            <main id="main" className="px-4 py-8 sm:px-8 lg:px-12">
              <div className="mx-auto max-w-page">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
