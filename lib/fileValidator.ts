/**
 * File Content Validator — Magic Byte Verification
 *
 * Validates uploaded file content against declared MIME types by checking
 * magic bytes (file signatures). Prevents malicious files disguised with
 * fake extensions from being stored.
 *
 * Supported formats: PDF, JPEG, PNG
 */

/** Magic byte signatures for supported file types */
const MAGIC_BYTES: Record<string, { bytes: number[]; offset: number }> = {
  'application/pdf': { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  'image/jpeg': { bytes: [0xff, 0xd8, 0xff], offset: 0 },
  'image/png': { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 }, // .PNG
};

/** MIME type aliases (e.g. image/jpg → image/jpeg) */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
};

/**
 * Validate that a buffer's magic bytes match the declared MIME type.
 *
 * @param buffer - File content buffer
 * @param declaredMimeType - The MIME type claimed by the client
 * @returns true if magic bytes match the declared type, false otherwise
 */
export function validateMagicBytes(
  buffer: Buffer,
  declaredMimeType: string,
): boolean {
  const normalizedType =
    MIME_ALIASES[declaredMimeType] ?? declaredMimeType;
  const signature = MAGIC_BYTES[normalizedType];

  if (!signature) {
    // Unknown MIME type — cannot validate, reject
    return false;
  }

  if (buffer.length < signature.offset + signature.bytes.length) {
    return false;
  }

  return signature.bytes.every(
    (byte, i) => buffer[signature.offset + i] === byte,
  );
}

/**
 * Detect the actual MIME type of a buffer from its magic bytes.
 *
 * @param buffer - File content buffer
 * @returns The detected MIME type, or null if unknown
 */
export function detectMimeType(buffer: Buffer): string | null {
  for (const [mimeType, signature] of Object.entries(MAGIC_BYTES)) {
    if (buffer.length < signature.offset + signature.bytes.length) {
      continue;
    }
    const matches = signature.bytes.every(
      (byte, i) => buffer[signature.offset + i] === byte,
    );
    if (matches) {
      return mimeType;
    }
  }
  return null;
}
