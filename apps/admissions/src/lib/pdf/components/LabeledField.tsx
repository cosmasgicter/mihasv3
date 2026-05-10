/**
 * LabeledField — a small UPPERCASE label above its value, used for all
 * form-like data rendering (applicant details, programme info, payment
 * metadata).
 *
 * Visual spec:
 *   Label:  9pt uppercase Source Sans 3, 1.2 letter-spacing, ink-500
 *   Value:  11pt Source Sans 3, ink-900
 *   Or:     use `mono` for reference codes (app number, receipt number)
 *
 * The value wraps freely — no fixed width constraint inside the component.
 * Layout (width, column span) is the responsibility of the parent.
 */

import { StyleSheet, Text, View } from '@react-pdf/renderer'

import { semantic, space, spacing, textStyles } from '../theme'

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing[2],
  },
  label: {
    ...textStyles.label,
    color: semantic.labelText,
    marginBottom: spacing[0.5],
  },
  value: {
    ...textStyles.body,
    color: semantic.bodyText,
  },
  valueStrong: {
    ...textStyles.bodyStrong,
    color: semantic.bodyText,
  },
  valueMono: {
    ...textStyles.code,
    color: semantic.bodyText,
  },
  valueMuted: {
    ...textStyles.body,
    color: semantic.mutedText,
  },
})

export interface LabeledFieldProps {
  label: string
  value: string | null | undefined
  /** Render value in bold. */
  strong?: boolean
  /** Render value in monospace (for reference codes, receipt numbers, etc). */
  mono?: boolean
  /** Fallback shown when value is null/undefined/empty. */
  fallback?: string
}

export function LabeledField({
  label,
  value,
  strong = false,
  mono = false,
  fallback = '—',
}: LabeledFieldProps) {
  const hasValue = typeof value === 'string' && value.trim().length > 0
  const display = hasValue ? value!.trim() : fallback

  const valueStyle = !hasValue
    ? styles.valueMuted
    : mono
      ? styles.valueMono
      : strong
        ? styles.valueStrong
        : styles.value

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Text style={valueStyle}>{display}</Text>
    </View>
  )
}

/**
 * Helper: narrow a raw status string into Title Case for display.
 * Keeps status values consistent across documents.
 */
export function formatStatusLabel(value: string | null | undefined, fallback = 'Unknown'): string {
  if (!value) return fallback
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return fallback
  return cleaned
    .split(/[_\-\s]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}
