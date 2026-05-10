/**
 * SectionHeading — consistent section titles across all document types.
 *
 * Visual spec:
 *   - Playfair Display 18pt semibold
 *   - Ink-700 color (institutional, not too loud)
 *   - Optional small gold underline (decorative accent — disabled by default)
 *   - Letter-spacing tightened -0.2 for display headings
 *
 * Usage:
 *   <SectionHeading>Applicant Information</SectionHeading>
 *   <SectionHeading accent>Programme Details</SectionHeading>
 */

import { StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'

import { semantic, spacing, textStyles } from '../theme'

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing[2],
  },
  heading: {
    ...textStyles.sectionHeading,
    color: semantic.sectionHeading,
  },
  accent: {
    width: spacing[8],
    height: 2,
    backgroundColor: semantic.brandAccent,
    marginTop: spacing[0.5],
  },
})

export interface SectionHeadingProps {
  children: ReactNode
  /** Render a short gold accent underline below the heading. */
  accent?: boolean
}

export function SectionHeading({ children, accent = false }: SectionHeadingProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.heading}>{children}</Text>
      {accent ? <View style={styles.accent} /> : null}
    </View>
  )
}
