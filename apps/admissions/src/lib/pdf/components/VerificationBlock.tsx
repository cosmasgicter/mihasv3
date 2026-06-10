/**
 * VerificationBlock — QR code + "scan to verify" caption.
 *
 * Used at the bottom-right of every document to provide institutional
 * verification. The QR encodes a JSON blob with the document type, reference
 * number, and key fields. Callers compute the payload; this component only
 * handles rendering.
 *
 * The QR data URL is precomputed by the document component using the existing
 * `qrcode` library (already in deps) and passed as a prop — we don't generate
 * it here because @react-pdf renders inside its own layout pass and async QR
 * generation should happen upstream.
 */

import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'

import { semantic, spacing, textStyles } from '../theme'

const QR_SIZE = 50 // pt — small enough to keep document on one page, still scannable

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    width: QR_SIZE + spacing[2] * 2,
  },
  qr: {
    width: QR_SIZE,
    height: QR_SIZE,
    marginBottom: spacing[0.5],
  },
  caption: {
    ...textStyles.footer,
    color: semantic.mutedText,
    textAlign: 'center',
  },
})

export interface VerificationBlockProps {
  /** Pre-generated QR code as a PNG data URL (from qrcode.toDataURL). */
  qrDataUrl: string
  /** Caption beneath the QR — default "Scan to verify". */
  caption?: string
}

export function VerificationBlock({
  qrDataUrl,
  caption = 'Scan to verify',
}: VerificationBlockProps) {
  return (
    <View style={styles.wrapper}>
      <Image src={qrDataUrl} style={styles.qr} />
      <Text style={styles.caption}>{caption}</Text>
    </View>
  )
}
