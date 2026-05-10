/**
 * BrandHeader — the institutional letterhead at the top of every page.
 *
 * Layout:
 *   [LOGO]    Institution Full Name            [DOCUMENT TYPE]
 *             Address line                     Reference / batch tag
 *
 * Rendered once per Page (via PageFrame fixed region) so it repeats on
 * continuation pages without duplicate code at each document.
 *
 * Visual spec:
 *   Logo:       ~40pt tall, left-aligned, vertically centered in the row
 *   Institution: Playfair Display 14pt semibold, ink-900
 *   Address:    Source Sans 3 9pt regular, ink-500
 *   Doc type:   Source Sans 3 9pt semibold uppercase, tracked, ink-500
 *   Divider:    0.5pt hairline in gold below the entire header
 *
 * The gold divider is the *one* decorative moment per page — enough to
 * signal institutional tradition, quiet enough to respect the reader.
 */

import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'

import { borderWidth, semantic, spacing, textStyles, type Institution } from '../theme'

/**
 * Derived layout constant — the total rendered height of BrandHeader in
 * points.
 *
 *   logo height (44)
 * + wrapper.paddingBottom (spacing[2] = 8)
 * + hairline divider (1)
 * + visual breathing room below the gold rule (~12)
 * = 65pt for the header block itself.
 *
 * Plus `wrapper.marginBottom` (spacing[4] = 16) for the gap before body
 * content. Plus an additional 1pt safety margin for sub-pixel rounding.
 *
 * `PageFrame` imports this and uses it as `body.paddingTop` so the body
 * column always begins exactly below the header regardless of future
 * padding changes. Stops the "magic 100pt that's now wrong" bug.
 */
export const BRAND_HEADER_HEIGHT = 44 + 8 + 1 + 12 + 16 + 1 // 82pt

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: spacing[2],
    marginBottom: spacing[4],
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: semantic.brandAccent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  logo: {
    width: 44,
    height: 44,
    objectFit: 'contain',
  },
  identityBlock: {
    flex: 1,
  },
  institutionName: {
    fontFamily: textStyles.sectionHeading.fontFamily,
    fontWeight: 600,
    fontSize: 15,
    lineHeight: 1.2,
    color: semantic.bodyText,
    marginBottom: spacing[0.5],
  },
  addressLine: {
    ...textStyles.metadata,
    color: semantic.mutedText,
  },
  metaBlock: {
    alignItems: 'flex-end',
  },
  docType: {
    ...textStyles.label,
    color: semantic.mutedText,
    letterSpacing: 1.4,
  },
  tagLine: {
    ...textStyles.metadata,
    color: semantic.mutedText,
    marginTop: spacing[0.5],
  },
})

export interface BrandHeaderProps {
  institution: Institution
  /** Document type shown on the right — e.g. "APPLICATION SLIP", "PAYMENT RECEIPT". */
  documentType: string
  /** Optional secondary line under the document type — e.g. batch or intake name. */
  tagLine?: string
  /** Hide the logo mark if the institution asset is missing or low quality. */
  showLogo?: boolean
}

export function BrandHeader({
  institution,
  documentType,
  tagLine,
  showLogo = true,
}: BrandHeaderProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        {showLogo ? (
          <Image src={institution.logoMark} style={styles.logo} />
        ) : null}

        <View style={styles.identityBlock}>
          <Text style={styles.institutionName}>{institution.fullName}</Text>
          <Text style={styles.addressLine}>{institution.address}</Text>
        </View>

        <View style={styles.metaBlock}>
          <Text style={styles.docType}>{documentType}</Text>
          {tagLine ? <Text style={styles.tagLine}>{tagLine}</Text> : null}
        </View>
      </View>
    </View>
  )
}
