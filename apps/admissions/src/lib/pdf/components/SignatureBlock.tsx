/**
 * SignatureBlock — the signature area at the bottom of official letters.
 *
 * Visual layout:
 *
 *   ╭── Pinyon Script signature (large, ink-900) ─────╮
 *   │   Dr Solomon Musonda                            │
 *   ╰──────────────────────────────────────────────────╯
 *   ──────────────────────────────
 *   Dr Solomon Musonda              (Source Sans bold — for clarity)
 *   Director                        (role, muted)
 *   MIHAS-KATC                      (institution, muted)
 *
 * Rationale — why a calligraphy name instead of a scanned signature:
 *   - A scanned signature would require storing and reading Dr Musonda's
 *     actual signature image, which has real-world legal and security
 *     implications we don't want to take on in this migration.
 *   - A calligraphy-rendered name is the academic convention used by
 *     many universities on typeset-only letterhead: it reads as the
 *     visual signature of the document without claiming to be a
 *     reproduction of the signatory's own handwriting.
 *   - The typeset name below the rule ensures the name is machine-
 *     readable and printable-clear regardless of zoom.
 *
 * If a real scanned signature image becomes available later, pass it via
 * `signatureImage` — it replaces the Pinyon Script rendering.
 */

import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'

import { borderWidth, semantic, spacing, textStyles } from '../theme'

const styles = StyleSheet.create({
  wrapper: {
    marginTop: spacing[3],
    width: 260,
  },
  scriptSignature: {
    ...textStyles.signatureScript,
    color: semantic.titleText,
    marginBottom: spacing[0.5],
    // Nudge the script baseline slightly so the line sits comfortably
    // below the signature's descenders (e.g. the loop of "y" in "Bwalya").
    paddingBottom: 2,
  },
  signatureImage: {
    height: 48,
    width: 'auto',
    marginBottom: spacing[1],
  },
  line: {
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: semantic.bodyText,
    marginBottom: spacing[2],
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
})

export interface SignatureBlockProps {
  /** Full name of the signatory (e.g. "Dr Solomon Musonda"). */
  name: string
  /** Role/title (e.g. "Director"). */
  role: string
  /** Institution line (optional, shown under the role). */
  institution?: string
  /** Optional scanned-signature image as a data URL — replaces the Pinyon Script rendering. */
  signatureImage?: string
}

export function SignatureBlock({
  name,
  role,
  institution,
  signatureImage,
}: SignatureBlockProps) {
  return (
    <View style={styles.wrapper}>
      {signatureImage ? (
        <Image src={signatureImage} style={styles.signatureImage} />
      ) : (
        <Text style={styles.scriptSignature}>{name}</Text>
      )}
      <View style={styles.line} />
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.role}>{role}</Text>
      {institution ? <Text style={styles.institutionLine}>{institution}</Text> : null}
    </View>
  )
}
