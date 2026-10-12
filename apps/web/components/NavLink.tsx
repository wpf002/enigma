'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({ href, children, count }: { href: string; children: ReactNode; count?: number | undefined }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-sm transition-colors duration-150 ${
        active ? 'bg-sunken font-medium text-text' : 'text-muted hover:bg-sunken hover:text-text'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`h-4 w-[2px] rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
        {children}
      </span>
      {count !== undefined && count > 0 && <span className="num rounded-full bg-accent px-2 text-xs font-medium text-accent-fg">{count}</span>}
    </Link>
  );
}
