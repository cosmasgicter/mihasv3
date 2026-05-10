/**
 * BrandFooter — the narrow footer at the bottom of every page.
 *
 * Layout:
 *   [disclaimer]                    [generated timestamp]    [page X of Y]
 *
 * Renders fixed at the bottom of the page via PageFrame. Page numbers use
 * @react-pdf's `<Text render={({pageNumber, totalPages}) => ...} />` API
 * which evaluates at layout time — no manual y-position tracking.
 *
 * Visual spec: 7pt Source Sans 3, ink-500, hairline divider above.
 */

import { StyleSheet, Text, View } from '@react-pdf/renderer'

import { borderWidth, semantic, spacing, textStyles } from '../theme'

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing[2],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: semantic.divider,
  },
  text: {
    ...textStyles.footer,
    color: semantic.mutedText,
  },
  center: {
    ...textStyles.footer,
    color: semantic.mutedText,
    textAlign: 'center',
    flex: 1,
  },
})

export interface BrandFooterProps {
  /** Short disclaimer on the left — default is "Computer-generated document." */
  disclaimer?: string
  /** Generated timestamp in the middle — usually "Generated DD Mmm YYYY HH:mm". */
  generatedLabel?: string
}

export function BrandFooter({
  disclaimer = 'Computer-generated document. No signature required.',
  generatedLabel,
}: BrandFooterProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.text}>{disclaimer}</Text>
      {generatedLabel ? (
        <Text style={styles.center}>{generatedLabel}</Text>
      ) : (
        <Text style={styles.center} />
      )}
      <Text
        style={styles.text}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        fixed
      />
    </View>
  )
}
