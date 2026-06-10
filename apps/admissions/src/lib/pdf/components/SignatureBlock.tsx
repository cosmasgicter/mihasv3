/**
 * SignatureBlock — the signature area at the bottom of official letters.
 *
 * Primary visual layout (with a scanned signature, the common case):
 *
 *   ╭── Scanned signature (PNG, ~56pt tall) ──────────╮
 *   │   ✍  handwritten Dr Solomon Musonda             │
 *   ╰──────────────────────────────────────────────────╯
 *   ──────────────────────────────
 *   Dr Solomon Musonda, MD           (Source Sans bold, postnominal inline)
 *   Managing Director                (role, muted)
 *   Mukuba Institute of Health       (institution, muted — line 1)
 *   and Applied Sciences             (may wrap)
 *   School of Nursing                (optional division, muted — line 2)
 *
 * Fallback layout (no `signatureImage` — used for non-Musonda signatories
 * or preview renders): the name is rendered in Pinyon Script above the
 * rule instead of an image. This is still academically conventional.
 *
 * Design rationale:
 *   - MIHAS's official application form carries Dr Musonda's scanned
 *     signature; our acceptance letters must match the authority of
 *     that stationery.
 *   - We keep Pinyon Script as a fallback for three cases:
 *       1. Preview renders during development
 *       2. Test fixtures that want a deterministic, non-image artefact
 *       3. Future signatories without a scanned signature on file
 *   - The typeset name below the rule ensures the signatory is machine-
 *     readable and printable-clear regardless of zoom, and matches the
 *     convention on MIHAS's own application form: "Dr Solomon Musonda, MD".
 *   - The division line ("School of Nursing") matches the form footer:
 *     "On behalf of Mukuba Institute of Health and Applied Sciences,
 *     School of Nursing".
 */

import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'

import { borderWidth, semantic, spacing, textStyles } from '../theme'

const styles = StyleSheet.create({
  wrapper: {
    // Zero top margin so the (now larger) signature keeps together with the
    // closing lines on page 1 of the acceptance letter rather than orphaning.
    marginTop: 0,
    width: 260,
  },
  scriptSignature: {
    ...textStyles.signatureScript,
    color: semantic.titleText,
    marginBottom: spacing[0.5],
    // Nudge the script baseline slightly so the line sits comfortably
    // below the signature's descenders (e.g. the loop of "y").
    paddingBottom: 2,
  },
  signatureImage: {
    // Explicit width + height (not width:'auto'). @react-pdf's Yoga layout
    // engine renders an <Image> with width:'auto' at the PNG's INTRINSIC
    // pixel width, which overflows the wrapper. The default signature scan
    // (director-signature.png) is cropped to the ink and upscaled to 472×208
    // (~2.27:1). 132×58 preserves that ratio and renders the signature at a
    // legible size above the rule. Callers can override via the
    // `signatureWidth`/`signatureHeight` props for a differently-shaped scan.
    objectFit: 'contain',
    marginBottom: spacing[1],
  },
  line: {
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: semantic.bodyText,
    marginBottom: spacing[1],
  },
  name: {
    ...textStyles.bodyStrong,
    color: semantic.bodyText,
  },
  role: {
    ...textStyles.metadata,
    color: semantic.mutedText,
    marginTop: spacing[0.5],
  },
  institutionLine: {
    ...textStyles.metadata,
    color: semantic.mutedText,
  },
  divisionLine: {
    ...textStyles.metadata,
    color: semantic.mutedText,
  },
})

export interface SignatureBlockProps {
  /** Full name of the signatory (e.g. "Dr Solomon Musonda"). */
  name: string
  /** Role/title (e.g. "Managing Director"). */
  role: string
  /**
   * Optional postnominal (e.g. "MD", "PhD"). When set, appears after
   * the name in both script and typeset forms, separated by a comma.
   */
  postnominal?: string
  /** Institution line (optional, shown under the role). */
  institution?: string
  /**
   * Optional division/school line (e.g. "School of Nursing"). Rendered
   * below the institution in the same muted style.
   */
  division?: string
  /**
   * Optional scanned-signature image path or data URL — replaces the
   * Pinyon Script rendering. When omitted, the script fallback is used.
   */
  signatureImage?: string
  /**
   * Optional explicit signature image dimensions (points). Defaults to
   * 175×11 — the aspect ratio of the default director-signature.png scan
   * (1227×77). Override for a differently-shaped signature image.
   */
  signatureWidth?: number
  signatureHeight?: number
}

/**
 * Compose the display name with optional postnominal:
 *   "Dr Solomon Musonda" + "MD" → "Dr Solomon Musonda, MD"
 */
function composeDisplayName(name: string, postnominal?: string): string {
  const trimmed = postnominal?.trim()
  return trimmed ? `${name}, ${trimmed}` : name
}

export function SignatureBlock({
  name,
  role,
  postnominal,
  institution,
  division,
  signatureImage,
  signatureWidth = 120,
  signatureHeight = 53,
}: SignatureBlockProps) {
  const displayName = composeDisplayName(name, postnominal)

  return (
    <View style={styles.wrapper}>
      {signatureImage ? (
        <Image
          src={signatureImage}
          style={[styles.signatureImage, { width: signatureWidth, height: signatureHeight }]}
        />
      ) : (
        <Text style={styles.scriptSignature}>{displayName}</Text>
      )}
      <View style={styles.line} />
      <Text style={styles.name}>{displayName}</Text>
      <Text style={styles.role}>{role}</Text>
      {institution ? <Text style={styles.institutionLine}>{institution}</Text> : null}
      {division ? <Text style={styles.divisionLine}>{division}</Text> : null}
    </View>
  )
}
