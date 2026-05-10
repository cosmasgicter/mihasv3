/**
 * FieldGrid — lay out a list of LabeledFields in a 2-column grid.
 *
 * Uses flexbox row-wrap. Each child takes 50% width (minus half the column
 * gap). Tasks that need more advanced layouts (3-column, uneven columns,
 * spanning cells) should compose their own View+flex layout rather than
 * extend this — keeps the primitive predictable.
 */

import { StyleSheet, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'

import { spacing } from '../theme'

const COLUMN_GAP = spacing[6] // 24pt between columns
const ROW_GAP = 0 // LabeledField.marginBottom provides row spacing

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -COLUMN_GAP / 2,
    marginVertical: -ROW_GAP / 2,
  },
  column2: {
    width: '50%',
    paddingHorizontal: COLUMN_GAP / 2,
    paddingVertical: ROW_GAP / 2,
  },
  column1: {
    width: '100%',
    paddingHorizontal: COLUMN_GAP / 2,
    paddingVertical: ROW_GAP / 2,
  },
})

export interface FieldGridProps {
  children: ReactNode
  /** Force a single-column stacked layout. Default: 2 columns. */
  columns?: 1 | 2
}

export function FieldGrid({ children, columns = 2 }: FieldGridProps) {
  const childArray = Array.isArray(children)
    ? children
    : [children].filter(Boolean)
  const columnStyle = columns === 2 ? styles.column2 : styles.column1

  return (
    <View style={styles.wrapper}>
      {childArray.map((child, index) => (
        <View key={index} style={columnStyle}>
          {child}
        </View>
      ))}
    </View>
  )
}
