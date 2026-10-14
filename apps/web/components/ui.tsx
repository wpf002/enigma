import Link from 'next/link';
import type { ReactNode } from 'react';
import { typeName } from '@/lib/labels';
import type { GateStatus } from '@/lib/types';
import { IconCheck, IconChevron, IconDash, IconHalf, IconX } from './icons';

/** Page title is the thing's name. Facts go in badges or `meta`, never in a paragraph. */
export function PageHeader({ title, badges, meta, actions }: { title: ReactNode; badges?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display text-xl">{title}</h1>
          {badges}
        </div>
        {meta && <p className="mt-2 text-sm text-muted">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled block. In a grid row its card stretches, so cards in one row share a height. */
export function Section({ title, aside, children, id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-12 flex min-w-0 scroll-mt-24 flex-col [&>.card]:flex-1">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="display text-lg">{title}</h2>
        {aside && <div className="min-w-0 max-w-full text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** A row of figures in one bordered strip. */
export function StatStrip({ children }: { children: ReactNode }) {
  return <dl className="mb-12 grid grid-cols-2 gap-y-6 border-y border-border py-6 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none sm:divide-x sm:divide-border">{children}</dl>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 px-4 first:pl-0 sm:px-6 sm:first:pl-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="display mt-1 truncate text-xl">{value}</dd>
      {sub && <dd className="num mt-1 truncate text-sm text-muted">{sub}</dd>}
    </div>
  );
}

export function Count({ children }: { children: ReactNode }) {
  return <span className="num text-sm text-muted">{children}</span>;
}

/** Contradiction type by its screen name. Identity is the text, never a color. */
export function TypeBadge({ type }: { type: string }) {
  return <span className="chip whitespace-nowrap text-text" title={type}>{typeName(type)}</span>;
}

const STATUS: Record<GateStatus, { label: string; icon: ReactNode; className: string }> = {
  MET: { label: 'Met', icon: <IconCheck />, className: 'text-good' },
  NOT_MET: { label: 'Not Met', icon: <IconX />, className: 'text-muted' },
  PARTIAL: { label: 'Partial', icon: <IconHalf />, className: 'text-muted' },
  NOT_RUN: { label: 'Not Run', icon: <IconDash />, className: 'text-muted' },
};

export function StatusBadge({ status }: { status: GateStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-sm ${s.className}`}>
      {s.icon}
      <span className="text-text">{s.label}</span>
    </span>
  );
}

/** A 0..1 score as a thin bar with the threshold marked. */
export function Meter({ value, threshold, emphasize }: { value: number | null; threshold?: number; emphasize?: boolean }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className="relative h-1 w-full rounded-full bg-sunken" role="img" aria-label={`score ${value === null ? 'not available' : v.toFixed(2)}`}>
      {value !== null && <div className={`h-1 rounded-full ${emphasize ? 'bg-accent' : 'bg-mark'}`} style={{ width: `${v * 100}%` }} />}
      {threshold !== undefined && <div className="absolute -top-1 h-3 w-px bg-text" style={{ left: `${threshold * 100}%` }} title={`Threshold ${threshold}`} />}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded border border-dashed border-border px-6 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="card border-critical px-6 py-8" role="alert">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
    </div>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-4 text-sm" aria-label="Pagination">
      <p className="num text-muted">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total.toLocaleString('en-US')}
      </p>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn" href={href(page - 1)}>Previous</Link> : <span className="btn" aria-disabled="true">Previous</span>}
        {page < pages ? <Link className="btn" href={href(page + 1)}>Next</Link> : <span className="btn" aria-disabled="true">Next</span>}
      </div>
    </nav>
  );
}

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <IconChevron width={12} height={12} />}
          {item.href ? <Link className="hover:text-text" href={item.href}>{item.label}</Link> : <span className="text-text">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Trial({ nctId, label }: { nctId: string; label?: string | null }) {
  return (
    <Link href={`/trials/${nctId}`} className={`link whitespace-nowrap text-sm ${label && label !== nctId ? 'font-medium' : 'font-mono'}`} title={nctId}>
      {label && label !== nctId ? label : nctId}
    </Link>
  );
}

/** Segmented control made of links. */
export function Tabs({ items }: { items: { label: ReactNode; href: string; active: boolean; count?: number }[] }) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-sm border border-border bg-surface p-1" role="tablist">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={t.active}
          className={`inline-flex items-center gap-2 rounded-sm px-3 py-1 text-sm transition-colors duration-150 ${t.active ? 'bg-sunken font-medium text-text' : 'text-muted hover:text-text'}`}
        >
          {t.label}
          {t.count !== undefined && <span className="num text-xs">{t.count.toLocaleString('en-US')}</span>}
        </Link>
      ))}
    </div>
  );
}
