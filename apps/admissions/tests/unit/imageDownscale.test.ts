/** Photo downscaling (SJR task 3.7, design R2-e, clause 2.11). */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { downscaleImageForUpload } from '@/lib/imageDownscale'

const MB = 1024 * 1024

function file(type: string, bytes: number, name = 'photo.jpg') {
  return new File([new Uint8Array(bytes)], name, { type })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('downscaleImageForUpload', () => {
  it('returns the original for a small image, a PDF, or an unsupported type', async () => {
    const createImageBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    for (const candidate of [file('image/jpeg', 1 * MB), file('application/pdf', 5 * MB), file('image/gif', 5 * MB)]) {
      expect(await downscaleImageForUpload(candidate)).toBe(candidate)
    }
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('returns the original when the long edge is already within 2400 px', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2000, height: 1500, close: vi.fn() })))
    const original = file('image/jpeg', 3 * MB)
    expect(await downscaleImageForUpload(original)).toBe(original)
  })

  it('returns a smaller file of the same type and name when downscaling helps', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4800, height: 3200, close: vi.fn() })))
    const drawImage = vi.fn()
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(public width: number, public height: number) {}
        getContext() {
          return { drawImage }
        }
        async convertToBlob() {
          return new Blob([new Uint8Array(500_000)], { type: 'image/jpeg' })
        }
      },
    )
    const original = file('image/jpeg', 3 * MB)
    const result = await downscaleImageForUpload(original)
    expect(result).not.toBe(original)
    expect(result.size).toBe(500_000)
    expect(result.type).toBe('image/jpeg')
    expect(result.name).toBe('photo.jpg')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2400, 1600)
  })

  it('falls back to the original on an error or a larger result', async () => {
    const original = file('image/png', 3 * MB, 'photo.png')
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode failed') }))
    expect(await downscaleImageForUpload(original)).toBe(original)

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 5000, height: 4000, close: vi.fn() })))
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { drawImage: vi.fn() }
        }
        async convertToBlob() {
          return new Blob([new Uint8Array(4 * MB)], { type: 'image/png' })
        }
      },
    )
    expect(await downscaleImageForUpload(original)).toBe(original)
  })
})
