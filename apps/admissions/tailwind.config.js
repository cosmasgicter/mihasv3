const { adminColors } = require('./src/design-system/tokens.colors.cjs')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
        // Touch-specific breakpoints
        'touch': { 'raw': '(hover: none) and (pointer: coarse)' },
        'no-touch': { 'raw': '(hover: hover) and (pointer: fine)' },
        // Orientation breakpoints
        'landscape': { 'raw': '(orientation: landscape)' },
        'portrait': { 'raw': '(orientation: portrait)' },
        // High DPI
        'retina': { 'raw': '(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)' },
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      minHeight: {
        'touch': '44px',
        'touch-lg': '48px',
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      },
      minWidth: {
        'touch': '44px',
        'touch-lg': '48px',
      },
      colors: {
        border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
        input: 'rgb(var(--color-input-rgb) / <alpha-value>)',
        ring: 'rgb(var(--color-ring-rgb) / <alpha-value>)',
        background: 'rgb(var(--color-background-rgb) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground-rgb) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground-rgb) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-secondary-foreground-rgb) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--color-destructive-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-destructive-foreground-rgb) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--color-muted-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground-rgb) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground-rgb) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--color-popover-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-popover-foreground-rgb) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--color-card-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-card-foreground-rgb) / <alpha-value>)',
        },
        skeleton: {
          DEFAULT: 'rgb(var(--color-muted-rgb) / <alpha-value>)',
          highlight: 'rgb(226 232 240 / <alpha-value>)',
        },
        error: {
          DEFAULT: 'rgb(var(--color-destructive-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-destructive-foreground-rgb) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground-rgb) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground-rgb) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground-rgb) / <alpha-value>)',
        },
        // Admin-specific colors (sourced from tokens.colors.js)
        admin: {
          bg: adminColors.bg,                       /* Admin background */
          card: adminColors.card,                   /* Admin card */
          border: adminColors.border,               /* Admin border - 3.39:1 on white, 3.24:1 on admin bg - WCAG AA compliant */
          text: adminColors.text,                   /* 16.75:1 on admin bg */
          'text-secondary': adminColors.textSecondary, /* 7.59:1 on admin bg */
          'text-muted': adminColors.textMuted,      /* 4.69:1 on admin bg */
        },
        // Link colors
        link: {
          DEFAULT: '#2563eb',           /* 4.52:1 on white */
          hover: '#1d4ed8',             /* 5.93:1 on white */
          visited: '#7c3aed',           /* 4.54:1 on white */
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
        // Mobile-optimized sizes
        'mobile-xs': ['0.75rem', { lineHeight: '1.125rem' }],
        'mobile-sm': ['0.875rem', { lineHeight: '1.375rem' }],
        'mobile-base': ['1rem', { lineHeight: '1.625rem' }],
        'mobile-lg': ['1.125rem', { lineHeight: '1.875rem' }],
      },
      borderRadius: {
        none: '0',
        sm: '0.25rem',     // 4px
        md: '0.375rem',    // 6px — default for inputs
        lg: '0.5rem',      // 8px — default for cards
        xl: '0.75rem',     // 12px
        '2xl': '1rem',     // 16px
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
        xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-vibrant': 'var(--gradient-primary)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'fade-in-right': 'fadeInRight 0.3s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'slide-up': 'slideUp 300ms ease-out',
        'scale-in': 'scaleIn 200ms ease-out',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'bounce-gentle': 'bounceGentle 2s infinite',
        'dialog-in': 'dialogIn 200ms ease-out',
        'backdrop-in': 'backdropIn 150ms ease-out',
        'toast-in': 'toastIn 200ms ease-out',
        'toast-out': 'toastOut 150ms ease-in',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        dialogIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        backdropIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        toastIn: {
          '0%': { opacity: '0', transform: 'translateY(-100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        toastOut: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-100%)' },
        },
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms')({
      strategy: 'class',
    }),
    // Micro-interaction utility classes (Req 12.1–12.3, 12.6, 12.7)
    // These are also defined in src/styles/interactive-feedback.css for
    // compound selectors (:hover, :active) that plugin addUtilities can't express.
    function ({ addUtilities }) {
      addUtilities({
        '.focus-ring': {
          '&:focus-visible': {
            'outline': 'none',
            '--tw-ring-offset-shadow': 'var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color)',
            '--tw-ring-shadow': 'var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color)',
            'box-shadow': 'var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000)',
            '--tw-ring-color': '#2563eb',
            '--tw-ring-offset-width': '2px',
          },
        },
        '.press-scale': {
          'transition-property': 'transform',
          'transition-duration': '100ms',
          '&:active': {
            'transform': 'scale(0.98)',
          },
        },
        '.btn-hover': {
          'transition-property': 'color, background-color, border-color, text-decoration-color, fill, stroke',
          'transition-duration': '150ms',
        },
        '.card-hover': {
          'transition-property': 'box-shadow',
          'transition-duration': '150ms',
          '&:hover': {
            'box-shadow': '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          },
        },
        '.link-hover': {
          'transition-property': 'color, background-color, border-color, text-decoration-color, fill, stroke',
          'transition-duration': '100ms',
        },
      })
    },
  ],
}
