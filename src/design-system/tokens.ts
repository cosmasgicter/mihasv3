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
      dark: '#0369A1',
    },
    success: {
      main: '#22C55E',
      hover: '#16A34A',
      light: '#4ADE80',
      dark: '#15803D',
    },
    error: {
      main: '#EF4444',
      hover: '#DC2626',
      light: '#F87171',
      dark: '#B91C1C',
    },
    warning: {
      main: '#F59E0B',
      hover: '#D97706',
      light: '#FBBF24',
      dark: '#B45309',
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
} as const
