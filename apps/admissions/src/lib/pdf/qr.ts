/**
 * QR code data URL generator — shared across all document types.
 *
 * Wraps the existing `qrcode` library with PDF-appropriate defaults:
 *   - medium error correction (tolerates ~15% damage — sufficient for print)
 *   - PNG output as a data URL (ready to drop into @react-pdf <Image>)
 *   - 1pt margin around the QR (avoid the oversized "quiet zone" that eats
 *     real estate on a busy PDF page)
 *
 * ## Payload versioning
 *
 * Every payload carries a `v` field as the first key. Current schema
 * version is `1`. The verifier on the receiving end should read `v`
 * first and branch — this lets us change fields later without breaking
 * existing printed receipts that students may scan months or years from
 * now.
 *
 * Version 1 schema:
 *   - v: 1 (required, first field)
 *   - type: 'application_slip' | 'payment_receipt' | 'acceptance_letter' |
 *           'conditional_acceptance'
 *   - per-type identifiers (tracking code, receipt number, application
 *     number, student name, institution, etc.)
 */

import QRCode from 'qrcode'

/** Current payload schema version. Bump on any field rename or removal. */
export const QR_PAYLOAD_VERSION = 1 as const

export type VerificationPayload = Record<string, string | number | null | undefined>

/**
 * Build a QR-ready payload object with the schema version prepended.
 * Exposed separately from buildQrDataUrl so tests can inspect the
 * serialised JSON shape without touching the async render path.
 */
export function buildQrPayload(
  payload: VerificationPayload,
): Record<string, string | number | null> {
  const versioned: Record<string, string | number | null> = { v: QR_PAYLOAD_VERSION }
  for (const [key, value] of Object.entries(payload)) {
    versioned[key] = value === undefined ? null : value
  }
  return versioned
}

export async function buildQrDataUrl(payload: VerificationPayload): Promise<string> {
  const json = JSON.stringify(buildQrPayload(payload))
  return QRCode.toDataURL(json, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240, // 3x the 80pt render size for crisp zoom
    color: {
      dark: '#0B1F3A',
      light: '#FFFFFF',
    },
  })
}
