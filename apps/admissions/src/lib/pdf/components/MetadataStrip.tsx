/**
 * MetadataStrip — the row directly below the document title showing:
 *   - reference/tracking code (left)
 *   - issue date (middle)
 *   - status badge (right)
 *
 * Flexbox row, space-between. Each slot is optional — missing slots collapse
 * naturally without breaking alignment.
 *
 * Visual spec: 9pt uppercase labels, 11pt value, hairline divider above and
 * below, ink-50 subtle background to differentiate from body content.
 */

import { StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'

import { borderWidth, radius, semantic, space, spacing, textStyles } from '../theme'

import { StatusBadge, type StatusVariant } from './StatusBadge'

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: semantic.surface,
    borderTopWidth: borderWidth.hairline,
    borderBottomWidth: borderWidth.hairline,
    borderColor: semantic.divider,
    borderRadius: radius.sm,
    marginBottom: space.sectionGap,
  },
  slot: {
    flexShrink: 1,
  },
  slotCenter: {
    flexShrink: 1,
    paddingHorizontal: spacing[4],
    alignItems: 'center',
  },
  label: {
    ...textStyles.label,
    color: semantic.labelText,
    marginBottom: spacing[1],
  },
  value: {
    ...textStyles.bodyStrong,
    color: semantic.bodyText,
  },
  valueMono: {
    ...textStyles.code,
    color: semantic.bodyText,
  },
})

export interface MetadataStripProps {
  /** Reference/tracking code — rendered in monospace. */
  reference?: { label: string; value: string } | null
  /** Issue date — rendered in body text. */
  issued?: { label: string; value: string } | null
  /** Right-aligned status badge. */
  status?: { variant: StatusVariant; label: string } | null
  /** Optional custom right-slot override (replaces status badge). */
  rightSlot?: ReactNode
}

export function MetadataStrip({ reference, issued, status, rightSlot }: MetadataStripProps) {
  return (
    <View style={styles.strip}>
      <View style={styles.slot}>
        {reference ? (
          <>
            <Text style={styles.label}>{reference.label}</Text>
            <Text style={styles.valueMono}>{reference.value}</Text>
          </>
        ) : null}
      </View>

      {issued ? (
        <View style={styles.slotCenter}>
          <Text style={styles.label}>{issued.label}</Text>
          <Text style={styles.value}>{issued.value}</Text>
        </View>
      ) : null}

      <View style={styles.slot}>
        {rightSlot ?? (status ? (
          <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
        ) : null)}
      </View>
    </View>
  )
}
