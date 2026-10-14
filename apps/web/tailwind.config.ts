import type { Config } from 'tailwindcss';

// Tokens only. Components never reference a raw color, an off-scale spacing value or a sixth type size.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      bg: 'var(--bg)',
      surface: 'var(--surface)',
      sunken: 'var(--sunken)',
      border: 'var(--border)',
      'border-strong': 'var(--border-strong)',
      control: 'var(--control)',
      text: 'var(--text)',
      muted: 'var(--text-muted)',
      accent: 'var(--accent)',
      'accent-fg': 'var(--accent-fg)',
      'accent-soft': 'var(--accent-soft)',
      good: 'var(--good)',
      critical: 'var(--critical)',
      mark: 'var(--mark)',
      'mark-soft': 'var(--mark-soft)',
      scrim: 'var(--scrim)',
    },
    spacing: { 0: '0', px: '1px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px', 12: '48px', 16: '64px', 24: '96px' },
    fontSize: {
      xs: ['12px', { lineHeight: '1.5' }],
      sm: ['14px', { lineHeight: '1.5' }],
      base: ['16px', { lineHeight: '1.6' }],
      lg: ['20px', { lineHeight: '1.4' }],
      xl: ['32px', { lineHeight: '1.2' }],
    },
    fontWeight: { normal: '400', medium: '500', bold: '700' },
    borderRadius: { none: '0', sm: '4px', DEFAULT: '8px', full: '9999px' },
    extend: {
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'], display: ['var(--font-display)', 'Georgia', 'serif'], mono: ['var(--font-mono)', 'ui-monospace', 'monospace'] },
      maxWidth: { page: '1200px', prose: '72ch' },
      boxShadow: { float: '0 8px 32px rgb(0 0 0 / 0.18)' },
    },
  },
  plugins: [],
};

export default config;
