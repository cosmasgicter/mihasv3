/**
 * PageFrame — wraps all document content with consistent margins, a fixed
 * BrandHeader at the top of every page, and a fixed BrandFooter at the
 * bottom.
 *
 * Usage pattern:
 *   <Document>
 *     <PageFrame institution={...} documentType="..." tagLine="...">
 *       <SectionHeading>...</SectionHeading>
 *       <FieldGrid>...</FieldGrid>
 *       ...
 *     </PageFrame>
 *   </Document>
 *
 * Why this shape:
 *   - BrandHeader is rendered with `fixed` so it repeats on continuation
 *     pages (the root cause of the old jsPDF "orphaned page 2" bug).
 *   - BrandFooter renders fixed at the bottom with auto page numbering.
 *   - Document content lives in the flexible middle region.
 *   - A4 page size is fixed — institutional documents are A4 globally.
 */

import { Page, StyleSheet, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'

import { semantic, space, textStyles, type Institution } from '../theme'

import { BrandFooter } from './BrandFooter'
import { BRAND_HEADER_HEIGHT, BrandHeader } from './BrandHeader'

const styles = StyleSheet.create({
  page: {
    // Reserve space for the fixed BrandHeader on EVERY page (not just the
    // first). The header is position:absolute/fixed, so it does not reserve
    // space in the flow — without this top padding, content that flows onto
    // continuation pages (or after a manual `break`) slides underneath the
    // repeating header. Applying the offset here (Page padding applies to
    // every page) fixes the overlap for all multi-page documents.
    paddingTop: space.pageMarginTop + BRAND_HEADER_HEIGHT,
    paddingBottom: space.pageMarginBottom + 16, // extra room for fixed footer
    paddingHorizontal: space.pageMarginX,
    fontFamily: textStyles.body.fontFamily,
    fontSize: textStyles.body.fontSize,
    color: semantic.bodyText,
    backgroundColor: semantic.paper,
  },
  header: {
    position: 'absolute',
    top: space.pageMarginTop,
    left: space.pageMarginX,
    right: space.pageMarginX,
  },
  body: {
    // Header clearance is handled by page.paddingTop (applies to every page),
    // so the body itself needs no extra top offset.
  },
  footer: {
    position: 'absolute',
    bottom: space.pageMarginBottom - 8,
    left: space.pageMarginX,
    right: space.pageMarginX,
  },
})

export interface PageFrameProps {
  institution: Institution
  documentType: string
  /** Optional secondary line under the document type (e.g. office or batch name). */
  tagLine?: string
  /** Children go into the document body. */
  children: ReactNode
  /** Footer options — disclaimer + generated timestamp. */
  footerDisclaimer?: string
  footerGeneratedLabel?: string
  /** Hide the logo in the header (used when institution logo is unavailable). */
  showLogo?: boolean
}

export function PageFrame({
  institution,
  documentType,
  tagLine,
  children,
  footerDisclaimer,
  footerGeneratedLabel,
  showLogo = true,
}: PageFrameProps) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <BrandHeader
          institution={institution}
          documentType={documentType}
          tagLine={tagLine}
          showLogo={showLogo}
        />
      </View>

      <View style={styles.body}>{children}</View>

      <View style={styles.footer} fixed>
        <BrandFooter
          disclaimer={footerDisclaimer}
          generatedLabel={footerGeneratedLabel}
        />
      </View>
    </Page>
  )
}
