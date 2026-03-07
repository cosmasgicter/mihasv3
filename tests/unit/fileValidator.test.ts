// @vitest-environment node
/**
 * Unit Tests for File Validator — Magic Byte Validation
 *
 * Tests validateMagicBytes() and detectMimeType() from lib/fileValidator.ts
 */
import { describe, it, expect } from 'vitest';
import { validateMagicBytes, detectMimeType } from '../../lib/fileValidator';

/** Helper: create a Buffer from hex byte values */
function buf(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

describe('validateMagicBytes', () => {
  describe('PDF (%PDF)', () => {
    it('accepts a valid PDF buffer', () => {
      // %PDF = 0x25 0x50 0x44 0x46
      const pdfBuffer = buf(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34);
      expect(validateMagicBytes(pdfBuffer, 'application/pdf')).toBe(true);
    });

    it('rejects a non-PDF buffer declared as PDF', () => {
      const jpegBuffer = buf(0xff, 0xd8, 0xff, 0xe0);
      expect(validateMagicBytes(jpegBuffer, 'application/pdf')).toBe(false);
    });
  });

  describe('JPEG (FF D8 FF)', () => {
    it('accepts a valid JPEG buffer', () => {
      const jpegBuffer = buf(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
      expect(validateMagicBytes(jpegBuffer, 'image/jpeg')).toBe(true);
    });

    it('accepts image/jpg as alias for image/jpeg', () => {
      const jpegBuffer = buf(0xff, 0xd8, 0xff, 0xe1);
      expect(validateMagicBytes(jpegBuffer, 'image/jpg')).toBe(true);
    });

    it('rejects a PNG buffer declared as JPEG', () => {
      const pngBuffer = buf(0x89, 0x50, 0x4e, 0x47);
      expect(validateMagicBytes(pngBuffer, 'image/jpeg')).toBe(false);
    });
  });

  describe('PNG (89 50 4E 47)', () => {
    it('accepts a valid PNG buffer', () => {
      const pngBuffer = buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
      expect(validateMagicBytes(pngBuffer, 'image/png')).toBe(true);
    });

    it('rejects a PDF buffer declared as PNG', () => {
      const pdfBuffer = buf(0x25, 0x50, 0x44, 0x46);
      expect(validateMagicBytes(pdfBuffer, 'image/png')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('rejects unknown MIME types', () => {
      const buffer = buf(0x00, 0x01, 0x02, 0x03);
      expect(validateMagicBytes(buffer, 'application/octet-stream')).toBe(false);
      expect(validateMagicBytes(buffer, 'text/plain')).toBe(false);
    });

    it('rejects empty buffers', () => {
      const empty = Buffer.alloc(0);
      expect(validateMagicBytes(empty, 'application/pdf')).toBe(false);
      expect(validateMagicBytes(empty, 'image/jpeg')).toBe(false);
      expect(validateMagicBytes(empty, 'image/png')).toBe(false);
    });

    it('rejects buffers shorter than the magic byte sequence', () => {
      const twoBytes = buf(0x25, 0x50);
      expect(validateMagicBytes(twoBytes, 'application/pdf')).toBe(false);
    });
  });
});

describe('detectMimeType', () => {
  it('detects PDF', () => {
    const pdfBuffer = buf(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
    expect(detectMimeType(pdfBuffer)).toBe('application/pdf');
  });

  it('detects JPEG', () => {
    const jpegBuffer = buf(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
    expect(detectMimeType(jpegBuffer)).toBe('image/jpeg');
  });

  it('detects PNG', () => {
    const pngBuffer = buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a);
    expect(detectMimeType(pngBuffer)).toBe('image/png');
  });

  it('returns null for unknown content', () => {
    const unknown = buf(0x00, 0x01, 0x02, 0x03, 0x04, 0x05);
    expect(detectMimeType(unknown)).toBeNull();
  });

  it('returns null for empty buffer', () => {
    expect(detectMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for random bytes', () => {
    const random = buf(0xde, 0xad, 0xbe, 0xef);
    expect(detectMimeType(random)).toBeNull();
  });
});
