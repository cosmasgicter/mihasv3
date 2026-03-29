/**
 * MIHAS Design System - Design Tokens
 * Central source of truth for all design values
 */

export const designTokens = {
  colors: {
    primary: {
      main: '#0EA5E9',
      hover: '#0284C7',
      light: '#38BDF8',
      darker: '#0369A1',
    },
    success: {
      main: '#22C55E',
      hover: '#16A34A',
      light: '#4ADE80',
      darker: '#15803D',
    },
    error: {
      main: '#EF4444',
      hover: '#DC2626',
      light: '#F87171',
      darker: '#B91C1C',
    },
    warning: {
      main: '#F59E0B',
      hover: '#D97706',
      light: '#FBBF24',
      darker: '#B45309',
    },
    neutral: {
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      300: '#D1D5DB',
      500: '#6B7280',
      600: '#4B5563',
      700: '#374151',
      900: '#111827',
    },
  },
  // Layout sizes (numbers are pixels where appropriate)
  layout: {
    sidebarCollapsed: 80,
    sidebarExpanded: 256,
    headerHeight: 64,
    maxContentWidth: 1200,
  },

  spacing: {
    compact: '0.75rem',
    standard: '1.5rem',
    spacious: '2rem',
  },

  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    '2xl': '1.5rem',
    full: '9999px',
  },
  // Typography tokens to keep sizes and line-heights consistent across the app
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    baseFontSize: '16px',
    scale: {
      xs: '0.75rem', // 12px
      sm: '0.875rem', // 14px
      base: '1rem', // 16px
      lg: '1.125rem', // 18px
      xl: '1.25rem', // 20px
      '2xl': '1.5rem', // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem', // 36px
      '5xl': '3rem', // 48px
    },
    lineHeight: {
      compact: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
    heading: {
      weight: 600,
      family: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI'",
    },
  },
} as const
