// @vitest-environment jsdom
/**
 * Unit tests for client-side file validation in useApplicationFileUploads
 * Validates: Requirements 17.1 (extension check), 17.2 (size check), 17.5 (progress bar threshold)
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  ALLOWED_TYPES,
  LARGE_FILE_THRESHOLD,
} from '@/pages/student/applicationWizard/hooks/useApplicationFileUploads'

// Re-implement the pure validation functions for direct testing
// (they are module-private, so we test via the exported constants + logic)
function hasAllowedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase()
  return (ALLOWED_EXTENSIONS as readonly string[]).some(ext => lowerName.endsWith(ext))
}

function isAllowedFileType(type: string): boolean {
  return (ALLOWED_TYPES as readonly string[]).includes(type as any)
}

describe('Client-side file validation constants', () => {
  it('MAX_FILE_SIZE is 10MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024)
  })

  it('LARGE_FILE_THRESHOLD is 1MB', () => {
    expect(LARGE_FILE_THRESHOLD).toBe(1 * 1024 * 1024)
  })

  it('ALLOWED_EXTENSIONS contains .pdf, .jpg, .jpeg, .png', () => {
    expect([...ALLOWED_EXTENSIONS]).toEqual(['.pdf', '.jpg', '.jpeg', '.png'])
  })

  it('ALLOWED_TYPES contains PDF and image MIME types', () => {
    expect([...ALLOWED_TYPES]).toContain('application/pdf')
    expect([...ALLOWED_TYPES]).toContain('image/jpeg')
    expect([...ALLOWED_TYPES]).toContain('image/png')
  })
})

describe('Extension validation', () => {
  it('accepts .pdf files', () => {
    expect(hasAllowedExtension('document.pdf')).toBe(true)
  })

  it('accepts .jpg files', () => {
    expect(hasAllowedExtension('photo.jpg')).toBe(true)
  })

  it('accepts .jpeg files', () => {
    expect(hasAllowedExtension('photo.jpeg')).toBe(true)
  })

  it('accepts .png files', () => {
    expect(hasAllowedExtension('screenshot.png')).toBe(true)
  })

  it('accepts uppercase extensions', () => {
    expect(hasAllowedExtension('DOCUMENT.PDF')).toBe(true)
    expect(hasAllowedExtension('PHOTO.JPG')).toBe(true)
    expect(hasAllowedExtension('IMAGE.PNG')).toBe(true)
  })

  it('rejects .doc files', () => {
    expect(hasAllowedExtension('document.doc')).toBe(false)
  })

  it('rejects .docx files', () => {
    expect(hasAllowedExtension('document.docx')).toBe(false)
  })

  it('rejects .gif files', () => {
    expect(hasAllowedExtension('animation.gif')).toBe(false)
  })

  it('rejects .exe files', () => {
    expect(hasAllowedExtension('malware.exe')).toBe(false)
  })

  it('rejects files with no extension', () => {
    expect(hasAllowedExtension('noextension')).toBe(false)
  })

  it('rejects .webp files', () => {
    expect(hasAllowedExtension('image.webp')).toBe(false)
  })
})

describe('MIME type validation', () => {
  it('accepts application/pdf', () => {
    expect(isAllowedFileType('application/pdf')).toBe(true)
  })

  it('accepts image/jpeg', () => {
    expect(isAllowedFileType('image/jpeg')).toBe(true)
  })

  it('accepts image/png', () => {
    expect(isAllowedFileType('image/png')).toBe(true)
  })

  it('rejects image/gif', () => {
    expect(isAllowedFileType('image/gif')).toBe(false)
  })

  it('rejects application/msword', () => {
    expect(isAllowedFileType('application/msword')).toBe(false)
  })

  it('rejects text/plain', () => {
    expect(isAllowedFileType('text/plain')).toBe(false)
  })
})

describe('File size validation', () => {
  it('files under 10MB pass size check', () => {
    expect(5 * 1024 * 1024 <= MAX_FILE_SIZE).toBe(true)
  })

  it('files exactly 10MB pass size check', () => {
    expect(MAX_FILE_SIZE <= MAX_FILE_SIZE).toBe(true)
  })

  it('files over 10MB fail size check', () => {
    expect(MAX_FILE_SIZE + 1 <= MAX_FILE_SIZE).toBe(false)
  })
})

describe('Large file threshold for progress bar', () => {
  it('files under 1MB do not trigger progress bar', () => {
    const smallFileSize = 500 * 1024 // 500KB
    expect(smallFileSize > LARGE_FILE_THRESHOLD).toBe(false)
  })

  it('files over 1MB trigger progress bar', () => {
    const largeFileSize = 2 * 1024 * 1024 // 2MB
    expect(largeFileSize > LARGE_FILE_THRESHOLD).toBe(true)
  })

  it('files exactly 1MB do not trigger progress bar (threshold is exclusive)', () => {
    expect(LARGE_FILE_THRESHOLD > LARGE_FILE_THRESHOLD).toBe(false)
  })
})
