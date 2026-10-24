import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
const dark = {
  canvas: '#0B1020',
  surface: '#111A2E',
  raised: '#17223A',
  foreground: '#EAF0FF',
  muted: '#98A8C4',
  subtle: '#7D8CA8',
  border: '#25324A',
  primary: '#22D3EE',
  primaryForeground: '#06202A',
  accent: '#8B5CF6',
  applied: '#60A5FA',
  interview: '#A78BFA',
  offer: '#34D399',
  closed: '#C48D96',
  warning: '#FBBF24',
  danger: '#FB7185',
  logoOrange: '#F59B52',
};
const light = {
  canvas: '#F4F7FB',
  surface: '#FFFFFF',
  raised: '#EAF0F8',
  foreground: '#15213A',
  muted: '#52627D',
  subtle: '#61718A',
  border: '#DCE3ED',
  primary: '#087C91',
  primaryForeground: '#FFFFFF',
  accent: '#6D28D9',
  applied: '#1D4ED8',
  interview: '#6D28D9',
  offer: '#047857',
  closed: '#944454',
  warning: '#92400E',
  danger: '#BE123C',
  logoOrange: '#B45309',
};
const variables = (theme: typeof dark) =>
  Object.fromEntries(Object.entries(theme).map(([key, value]) => [`--color-${key}`, value]));
export const designTokens = {
  dark,
  light,
  radius: 16,
  motion: { fast: 120, base: 180, page: 240 },
  charts: {
    cyan: '#22D3EE',
    purple: '#8B5CF6',
    green: '#34D399',
    blue: '#60A5FA',
    orange: '#FBBF24',
  },
};
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-canvas)',
        foreground: 'var(--color-foreground)',
        card: { DEFAULT: 'var(--color-surface)', foreground: 'var(--color-foreground)' },
        popover: { DEFAULT: 'var(--color-raised)', foreground: 'var(--color-foreground)' },
        primary: { DEFAULT: 'var(--color-primary)', foreground: 'var(--color-primaryForeground)' },
        secondary: { DEFAULT: 'var(--color-raised)', foreground: 'var(--color-foreground)' },
        muted: { DEFAULT: 'var(--color-raised)', foreground: 'var(--color-muted)' },
        accent: { DEFAULT: 'var(--color-raised)', foreground: 'var(--color-foreground)' },
        destructive: { DEFAULT: 'var(--color-danger)', foreground: '#FFFFFF' },
        border: 'var(--color-border)',
        input: 'var(--color-border)',
        ring: 'var(--color-primary)',
        brand: '#22D3EE',
        purple: 'var(--color-accent)',
        surface: 'var(--color-surface)',
        raised: 'var(--color-raised)',
        subtle: 'var(--color-subtle)',
        status: {
          applied: 'var(--color-applied)',
          interview: 'var(--color-interview)',
          offer: 'var(--color-offer)',
          closed: 'var(--color-closed)',
        },
        warning: 'var(--color-warning)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        display: ['var(--font-display)', 'PingFang SC', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { lg: '16px', md: '10px', sm: '6px', panel: '20px' },
      maxWidth: { content: '1280px' },
      spacing: { sidebar: '248px', 'sidebar-compact': '72px', header: '72px', drawer: '560px' },
      boxShadow: {
        card: '0 8px 32px rgb(0 0 0 / .1)',
        overlay: '0 24px 80px rgb(0 0 0 / .35)',
        glow: '0 8px 28px rgb(34 211 238 / .08)',
      },
      backgroundImage: {
        'hero-glow': 'radial-gradient(ellipse at 80% 0%, rgb(34 211 238 / .08), transparent 55%)',
      },
      animation: { 'radar-spin': 'spin 12s linear infinite', 'fade-in': 'fade-in .24s ease-out' },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(5px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    plugin(({ addBase }) => {
      addBase({ ':root': variables(light), '.dark': variables(dark) });
    }),
  ],
};
export default config;
