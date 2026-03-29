/**
 * MIHAS Design System
 * Central export for all design system utilities
 */

export { designTokens } from './tokens'
export type DesignTokens = typeof import('./tokens').designTokens

export {
  buttonVariants,
  buttonSizes,
  cardVariants,
  inputVariants,
  badgeVariants,
  layoutPatterns,
} from './variants'
