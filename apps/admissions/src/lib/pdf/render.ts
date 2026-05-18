/**
 * renderToBlob — internal helper that converts a ReactPDF element tree into
 * a browser-friendly Blob with correct MIME type.
 *
 * This is the single seam between document components (JSX) and the public
 * generator functions that return a Blob. Keeps error handling in one place.
 *
 * Font registration happens on first call (registerPdfFonts() is idempotent).
 * Dynamic import of `@react-pdf/renderer/pdf` is used so that the PDF engine
 * bundle is only pulled in when a PDF is actually rendered — matches the
 * existing lazy-load pattern from the old jsPDF generators.
 */

import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

import { sanitizeForLog } from '../security'

import { registerPdfFonts } from './theme'
import { logger } from '@/lib/logger'

export async function renderToBlob(
  element: ReactElement<DocumentProps>,
): Promise<Blob> {
  registerPdfFonts()

  try {
    const { pdf } = await import('@react-pdf/renderer')
    const instance = pdf(element)
    const buffer = await instance.toBlob()
    // @react-pdf returns a Blob with its own internal MIME; ensure it's
    // the standard application/pdf type so `download` and `open-in-new-tab`
    // work consistently across browsers.
    if (buffer.type === 'application/pdf') return buffer
    return new Blob([await buffer.arrayBuffer()], { type: 'application/pdf' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('[pdf] renderToBlob failed:', sanitizeForLog(message))
    throw new Error(`PDF rendering failed: ${message}`)
  }
}
