'use client';

import { useEffect, useState } from 'react';
import { IconMoon, IconSun } from './icons';

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    setDark(stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('enigma-theme', next ? 'dark' : 'light');
    } catch {
      // storage unavailable: the choice lasts for this page only
    }
  };
  const label = dark ? 'Light Theme' : 'Dark Theme';
  return (
    <button type="button" onClick={toggle} className="btn border-transparent bg-transparent px-2 text-muted" aria-label={label} title={label}>
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}
