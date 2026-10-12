import Link from 'next/link';
import type { ReactNode } from 'react';
import type { GateStatus } from '@/lib/types';
import { IconCheck, IconChevron, IconDash, IconHalf, IconX } from './icons';

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-12 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-xl font-bold">{title}</h1>
        {children && <div className="mt-3 max-w-prose text-base text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, aside, children, id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-16">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside && <div className="text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-xl font-bold">{value}</p>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
    </div>
  );
}

/** Contradiction type. Identity is the code and the label, never a color. */
export function TypeBadge({ type, label }: { type: string; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span className="num rounded-sm border border-border-strong px-1 font-mono text-xs font-medium">{type}</span>
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

const STATUS: Record<GateStatus, { label: string; icon: ReactNode; className: string }> = {
  MET: { label: 'Met', icon: <IconCheck />, className: 'text-good' },
  NOT_MET: { label: 'Not met', icon: <IconX />, className: 'text-critical' },
  PARTIAL: { label: 'Partial', icon: <IconHalf />, className: 'text-text' },
  NOT_RUN: { label: 'Not run', icon: <IconDash />, className: 'text-muted' },
};

export function StatusBadge({ status }: { status: GateStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium ${s.className}`}>
      {s.icon}
      <span className="text-text">{s.label}</span>
    </span>
  );
}

export function PassFail({ pass, children }: { pass: boolean; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${pass ? 'text-good' : 'text-critical'}`}>
      {pass ? <IconCheck /> : <IconX />}
      <span className="text-text">{children ?? (pass ? 'Pass' : 'Fail')}</span>
    </span>
  );
}

/** A 0..1 score as a thin bar with the threshold marked. */
export function Meter({ value, threshold, emphasize }: { value: number | null; threshold?: number; emphasize?: boolean }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className="relative h-2 w-full rounded-full bg-sunken" role="img" aria-label={`score ${value === null ? 'not available' : v.toFixed(2)}`}>
      {value !== null && <div className={`h-2 rounded-full ${emphasize ? 'bg-accent' : 'bg-mark'}`} style={{ width: `${v * 100}%` }} />}
      {threshold !== undefined && <div className="absolute -top-1 h-4 w-px bg-text" style={{ left: `${threshold * 100}%` }} title={`threshold ${threshold}`} />}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-8 py-12 text-center">
      <p className="text-base font-medium">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-prose text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="card border-critical px-8 py-12" role="alert">
      <p className="text-base font-medium">{title}</p>
      <p className="mt-2 max-w-prose text-sm text-muted">{message}</p>
    </div>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between gap-4 text-sm" aria-label="Pagination">
      <p className="num text-muted">
        {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total.toLocaleString('en-US')}
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
    <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          {i > 0 && <IconChevron width={12} height={12} />}
          {item.href ? <Link className="link" href={item.href}>{item.label}</Link> : <span className="text-text">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Trial({ nctId, label }: { nctId: string; label?: string | null }) {
  return (
    <Link href={`/trials/${nctId}`} className="link whitespace-nowrap font-mono text-sm">
      {label && label !== nctId ? `${label} · ${nctId}` : nctId}
    </Link>
  );
}
