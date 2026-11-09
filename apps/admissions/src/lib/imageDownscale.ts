/**
 * Client-side photo downscaling before upload (student-journey-repair task 3.7,
 * design R2-e, clause 2.11).
 *
 * A phone photo is routinely several megabytes; on a weak uplink that is the
 * difference between an upload that finishes and one that stalls. This shrinks a
 * large JPEG or PNG to a 2400 px long edge and returns the smaller file. It is a
 * convenience, never a gate: the server's size, type and magic-byte validation
 * still decide acceptance, and any failure here returns the original file.
 */
import { logger } from '@/lib/logger'

export const DOWNSCALE_MIN_BYTES = 2 * 1024 * 1024
export const DOWNSCALE_MAX_EDGE = 2400
export const DOWNSCALE_ENCODE_TIMEOUT_MS = 5000
const JPEG_QUALITY = 0.85

type Drawable = ImageBitmap
type EncodeResult = Blob | null

async function encode(bitmap: Drawable, width: number, height: number, type: string): Promise<EncodeResult> {
  const quality = type === 'image/jpeg' ? JPEG_QUALITY : undefined
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0, width, height)
    return canvas.convertToBlob({ type, quality })
  }
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, width, height)
  return new Promise<EncodeResult>((resolve) => canvas.toBlob(resolve, type, quality))
}

/** The downscaled file when that is smaller, otherwise the original. Never throws. */
export async function downscaleImageForUpload(file: File): Promise<File> {
  if (
    (file.type !== 'image/jpeg' && file.type !== 'image/png') ||
    file.size <= DOWNSCALE_MIN_BYTES ||
    typeof createImageBitmap !== 'function'
  ) {
    return file
  }

  let bitmap: ImageBitmap | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    bitmap = await createImageBitmap(file)
    const longEdge = Math.max(bitmap.width, bitmap.height)
    if (longEdge <= DOWNSCALE_MAX_EDGE) return file

    const scale = DOWNSCALE_MAX_EDGE / longEdge
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), DOWNSCALE_ENCODE_TIMEOUT_MS)
    })
    const result = await Promise.race([encode(bitmap, width, height, file.type), timeout])
    if (result === 'timeout' || result === null || result.size >= file.size) return file
    return new File([result], file.name, { type: file.type })
  } catch {
    logger.debug('Photo downscaling skipped', { reason: 'error' })
    return file
  } finally {
    if (timer !== null) clearTimeout(timer)
    bitmap?.close?.()
  }
}
