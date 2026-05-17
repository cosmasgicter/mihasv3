/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        insight: 'rgb(var(--color-insight) / <alpha-value>)',
        // Modal scrim — brand-tinted near-black for overlays. Use `bg-scrim/50`.
        // Added 2026-05-17 per design audit (replaces `bg-black/N` anti-pattern).
        scrim: 'rgb(12 14 24 / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 20px 50px rgba(28, 34, 45, 0.08)',
      },
      backgroundImage: {
        atmosphere:
          'radial-gradient(circle at top left, rgba(13, 91, 215, 0.14), transparent 28%), radial-gradient(circle at bottom right, rgba(12, 110, 84, 0.18), transparent 34%), linear-gradient(180deg, rgba(245, 247, 250, 1) 0%, rgba(236, 241, 246, 1) 100%)',
      },
      minHeight: {
        touch: '44px',
        'touch-lg': '48px',
      },
      minWidth: {
        touch: '44px',
        'touch-lg': '48px',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 180ms ease-out',
      },
    },
  },
  plugins: [],
}

