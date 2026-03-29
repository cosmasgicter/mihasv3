// @vitest-environment node
/**
 * Property Tests for Magic Byte Validation — P30
 *
 * Feature: website-quality-remediation, Property 30: Magic byte validation
 *
 * For any uploaded file, if the first bytes of the file content do not match
 * the magic bytes for any allowed file type (PDF: %PDF, JPEG: FF D8 FF,
 * PNG: 89 50 4E 47), the upload should be rejected with HTTP 400 regardless
 * of the declared MIME type.
 *
 * **Validates: Requirements 33.1, 33.2, 33.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateMagicBytes, detectMimeType } from '../../lib/fileValidator';

/** Known magic byte prefixes for each supported MIME type */
const SIGNATURES: Array<{ mimeType: string; prefix: number[] }> = [
  { mimeType: 'application/pdf', prefix: [0x25, 0x50, 0x44, 0x46] },
  { mimeType: 'image/jpeg', prefix: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', prefix: [0x89, 0x50, 0x4e, 0x47] },
];

/** Arbitrary: pick a supported MIME type and its prefix */
const signatureArb = fc.constantFrom(...SIGNATURES);

/** Arbitrary: random trailing bytes to append after magic bytes */
const trailingBytesArb = fc.uint8Array({ minLength: 0, maxLength: 64 });

/** Arbitrary: a MIME type string from the supported set (including alias) */
const supportedMimeArb = fc.constantFrom(
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
);

describe('Magic Byte Validation Property Tests (P30)', () => {
  describe('P30.1: Correct magic bytes always validate for their MIME type', () => {
    it('validateMagicBytes returns true when buffer starts with correct magic bytes', () => {
      fc.assert(
        fc.property(signatureArb, trailingBytesArb, (sig, trailing) => {
          const buffer = Buffer.concat([
            Buffer.from(sig.prefix),
            Buffer.from(trailing),
          ]);
          expect(validateMagicBytes(buffer, sig.mimeType)).toBe(true);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P30.2: Wrong magic bytes always fail validation', () => {
    it('validateMagicBytes returns false when buffer has wrong magic bytes for declared type', () => {
      fc.assert(
        fc.property(
          signatureArb,
          signatureArb,
          trailingBytesArb,
          (actualSig, declaredSig, trailing) => {
            // Only test when actual and declared differ
            fc.pre(actualSig.mimeType !== declaredSig.mimeType);
            // Also skip image/jpg alias case
            fc.pre(
              !(actualSig.mimeType === 'image/jpeg' && declaredSig.mimeType === 'image/jpg') &&
              !(actualSig.mimeType === 'image/jpg' && declaredSig.mimeType === 'image/jpeg'),
            );

            const buffer = Buffer.concat([
              Buffer.from(actualSig.prefix),
              Buffer.from(trailing),
            ]);
            expect(validateMagicBytes(buffer, declaredSig.mimeType)).toBe(false);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('P30.3: detectMimeType returns correct type for known magic bytes', () => {
    it('detectMimeType identifies the correct MIME type from magic bytes', () => {
      fc.assert(
        fc.property(signatureArb, trailingBytesArb, (sig, trailing) => {
          const buffer = Buffer.concat([
            Buffer.from(sig.prefix),
            Buffer.from(trailing),
          ]);
          expect(detectMimeType(buffer)).toBe(sig.mimeType);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P30.4: detectMimeType returns null for arbitrary non-matching buffers', () => {
    it('returns null for buffers that do not start with any known magic bytes', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 4, maxLength: 128 }).filter((arr) => {
            // Exclude buffers that accidentally start with known magic bytes
            const b = Buffer.from(arr);
            return (
              !(b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) &&
              !(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) &&
              !(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
            );
          }),
          (arr) => {
            expect(detectMimeType(Buffer.from(arr))).toBeNull();
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('P30.5: image/jpg alias resolves correctly', () => {
    it('validateMagicBytes accepts image/jpg as alias for image/jpeg', () => {
      fc.assert(
        fc.property(trailingBytesArb, (trailing) => {
          const buffer = Buffer.concat([
            Buffer.from([0xff, 0xd8, 0xff]),
            Buffer.from(trailing),
          ]);
          expect(validateMagicBytes(buffer, 'image/jpg')).toBe(true);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P30.6: Unknown MIME types are always rejected', () => {
    it('validateMagicBytes returns false for unsupported MIME types regardless of buffer content', () => {
      const unknownMimeArb = fc.constantFrom(
        'application/octet-stream',
        'text/plain',
        'text/html',
        'application/zip',
        'video/mp4',
      );

      fc.assert(
        fc.property(
          unknownMimeArb,
          fc.uint8Array({ minLength: 0, maxLength: 64 }),
          (mime, arr) => {
            expect(validateMagicBytes(Buffer.from(arr), mime)).toBe(false);
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});


/**
 * Property 9: File magic byte validation idempotency
 *
 * Feature: production-remediation
 *
 * For any file buffer and declared MIME type, calling validateMagicBytes(buffer, mimeType)
 * twice on the same inputs must return the same boolean result. Additionally, for any buffer
 * whose actual magic bytes match a supported type, detectMimeType(buffer) must return that type.
 *
 * **Validates: Requirements 17.3, 17.6**
 */
describe('File Magic Byte Validation Idempotency (Property 9)', () => {
  describe('P9.1: validateMagicBytes is idempotent for valid magic bytes + matching MIME', () => {
    it('calling validateMagicBytes twice on the same buffer and MIME type returns the same result', () => {
      fc.assert(
        fc.property(signatureArb, trailingBytesArb, (sig, trailing) => {
          const buffer = Buffer.concat([
            Buffer.from(sig.prefix),
            Buffer.from(trailing),
          ]);
          const first = validateMagicBytes(buffer, sig.mimeType);
          const second = validateMagicBytes(buffer, sig.mimeType);
          expect(first).toBe(second);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P9.2: validateMagicBytes is idempotent for arbitrary buffers and MIME types', () => {
    it('calling validateMagicBytes twice on random buffer + random MIME returns the same result', () => {
      const anyMimeArb = fc.constantFrom(
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'text/plain',
        'application/octet-stream',
      );

      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 128 }),
          anyMimeArb,
          (arr, mime) => {
            const buffer = Buffer.from(arr);
            const first = validateMagicBytes(buffer, mime);
            const second = validateMagicBytes(buffer, mime);
            expect(first).toBe(second);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('P9.3: detectMimeType is idempotent for buffers with known magic bytes', () => {
    it('calling detectMimeType twice on the same buffer returns the same type', () => {
      fc.assert(
        fc.property(signatureArb, trailingBytesArb, (sig, trailing) => {
          const buffer = Buffer.concat([
            Buffer.from(sig.prefix),
            Buffer.from(trailing),
          ]);
          const first = detectMimeType(buffer);
          const second = detectMimeType(buffer);
          expect(first).toBe(second);
          // Additionally, for buffers with known magic bytes, detectMimeType must return that type
          expect(first).toBe(sig.mimeType);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P9.4: detectMimeType is idempotent for arbitrary buffers', () => {
    it('calling detectMimeType twice on any random buffer returns the same result', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 128 }),
          (arr) => {
            const buffer = Buffer.from(arr);
            const first = detectMimeType(buffer);
            const second = detectMimeType(buffer);
            expect(first).toBe(second);
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});
