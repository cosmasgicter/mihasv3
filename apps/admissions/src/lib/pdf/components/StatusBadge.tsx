/**
 * StatusBadge — small colored pill indicating the state of a document.
 *
 * Variants:
 *   verified   — green, used on verified payment receipts
 *   approved   — green, used on unconditional acceptance letters
 *   conditional — red-tinted, used on conditional acceptance letters
 *   pending    — neutral ink-500, used on unverified or draft states
 *
 * Appears in MetadataStrip at the top of each document.
 */

import { StyleSheet, Text, View } from '@react-pdf/renderer'

import { colors, radius, semantic, spacing, textStyles } from '../theme'

export type StatusVariant = 'verified' | 'approved' | 'conditional' | 'pending'

const variantStyles = {
  verified: {
    bg: '#E5F0E8',
    fg: colors.accent.green,
  },
  approved: {
    bg: '#E5F0E8',
    fg: colors.accent.green,
  },
  conditional: {
    bg: '#F7E4EA',
    fg: colors.accent.red,
  },
  pending: {
    bg: colors.ink[50],
    fg: semantic.mutedText,
  },
} as const

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: radius.sm,
  },
  text: {
    ...textStyles.label,
    letterSpacing: 1.4,
  },
})

export interface StatusBadgeProps {
  variant: StatusVariant
  children: string
}

export function StatusBadge({ variant, children }: StatusBadgeProps) {
  const palette = variantStyles[variant]
  return (
    <View style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.fg }]}>{children}</Text>
    </View>
  )
}
