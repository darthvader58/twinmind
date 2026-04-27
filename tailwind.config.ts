import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        'panel-border': 'var(--panel-border)',
        'panel-inner': 'var(--panel-inner)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        'accent-blue': 'var(--accent-blue)',
        'accent-violet': 'var(--accent-violet)',
        'accent-green': 'var(--accent-green)',
        'accent-amber': 'var(--accent-amber)',
        'accent-cyan': 'var(--accent-cyan)',
        'focus-ring': 'var(--focus-ring)',
      },
    },
  },
  plugins: [],
};

export default config;
