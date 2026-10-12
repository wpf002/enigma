import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...props,
});

export const IconCheck = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 8.5l3.2 3.2L13 5" /></svg>;
export const IconX = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
export const IconDash = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 8h8" /></svg>;
export const IconHalf = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11" /><path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor" stroke="none" /></svg>;
export const IconSearch = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>;
export const IconArrow = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
export const IconBack = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M13 8H3M7 4L3 8l4 4" /></svg>;
export const IconDownload = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" /></svg>;
export const IconChevron = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 4l4 4-4 4" /></svg>;
export const IconSun = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></svg>;
export const IconMoon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" /></svg>;
export const IconBell = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 11V7a4 4 0 018 0v4l1.2 1.5H2.8L4 11zM6.5 14h3" /></svg>;
export const IconExternal = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" /></svg>;

// navigation
// Overview: a summary strip over two panels.
export const IconOverview = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="2.5" y="2.5" width="11" height="3.5" rx="1" /><rect x="2.5" y="8.5" width="5" height="5" rx="1" /><rect x="10" y="8.5" width="3.5" height="5" rx="1" /></svg>;
// Contradictions: not equal.
export const IconConflict = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 6h10M3 10h10M10.5 2.5l-5 11" /></svg>;
// Map: a hub and three linked nodes.
export const IconMap = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M8 8.5L3.5 4M8 8.5l4.5-4M8 8.5l1.5 4.5" /><circle cx="8" cy="8.5" r="1.8" fill="currentColor" stroke="none" /><circle cx="3.5" cy="4" r="1.5" fill="currentColor" stroke="none" /><circle cx="12.5" cy="4.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="9.5" cy="13" r="1.5" fill="currentColor" stroke="none" /></svg>;
// Timeline: events along an axis.
export const IconTimeline = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M1.5 8h13M4.5 8V5M8 8v3M11.5 8V5" /><circle cx="4.5" cy="3.8" r="1.3" fill="currentColor" stroke="none" /><circle cx="8" cy="12.2" r="1.3" fill="currentColor" stroke="none" /><circle cx="11.5" cy="3.8" r="1.3" fill="currentColor" stroke="none" /></svg>;
// Gate Failures: blocked.
export const IconGate = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="8" cy="8" r="5.5" /><path d="M4.1 4.1l7.8 7.8" /></svg>;
// Watchlists: an eye.
export const IconWatch = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></svg>;
// Validation: a checklist.
export const IconChecklist = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M2.5 4.5l1.3 1.3L6 3.5M8.5 4.5h5M2.5 11l1.3 1.3L6 10M8.5 11h5" /></svg>;
