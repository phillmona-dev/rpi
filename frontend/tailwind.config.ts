import type { Config } from 'tailwindcss';

/**
 * Design tokens live in globals.css as CSS custom properties (light + dark).
 * Tailwind only maps semantic names to those variables, so theming is a CSS-level concern.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1600px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        sidebar: { DEFAULT: 'hsl(var(--sidebar))', foreground: 'hsl(var(--sidebar-foreground))', accent: 'hsl(var(--sidebar-accent))', border: 'hsl(var(--sidebar-border))' },
        status: {
          good: 'var(--status-good)', warning: 'var(--status-warning)', serious: 'var(--status-serious)', critical: 'var(--status-critical)', neutral: 'var(--status-neutral)',
        },
        sector: { education: 'var(--sector-education)', health: 'var(--sector-health)', manufacturing: 'var(--sector-manufacturing)', agriculture: 'var(--sector-agriculture)' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      fontFamily: { sans: ['var(--font-sans)', 'var(--font-ethiopic)', 'system-ui', 'sans-serif'] },
      /* Readability scale: every step is one size up from Tailwind's default so dense
         executive views stay legible on office displays (smallest text = 12px). */
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }],
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.3125rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.625rem', { lineHeight: '2rem' }],
        '3xl': ['2rem', { lineHeight: '2.375rem' }],
      },
      boxShadow: { card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)' },
      keyframes: { pulseDot: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } } },
      animation: { pulseDot: 'pulseDot 1.6s ease-in-out infinite' },
      screens: { tablet: '768px', laptop: '1024px', desktop: '1280px', wide: '1536px' },
    },
  },
  plugins: [],
};
export default config;
