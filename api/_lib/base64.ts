/**
 * Base64 Utility Functions
 * 
 * Bun-compatible Base64 encoding/decoding utilities that work across
 * Node.js, Bun, and browser environments without relying on Node.js Buffer APIs.
 * 
 * Feature: bun-vercel-runtime-forensics
 * Requirements: 3.1, 3.4
 */

/**
 * Decode a URL-safe Base64 string to UTF-8 text.
 * This function is Bun-compatible and does not rely on Node.js Buffer APIs.
 * 
 * @param base64Url - URL-safe Base64 encoded string (uses `-` and `_` instead of `+` and `/`)
 * @returns Decoded UTF-8 string
 * @throws Error if the input is not valid Base64
 * 
 * @example
 * ```typescript
 * const payload = decodeBase64Url('eyJzdWIiOiIxMjM0NTY3ODkwIn0');
 * // Returns: '{"sub":"1234567890"}'
 * ```
 * 
 * Requirements: 3.1, 3.4
 */
export function decodeBase64Url(base64Url: string): string {
  // Handle empty string
  if (!base64Url) {
    return '';
  }

  // Convert URL-safe Base64 to standard Base64
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed (Base64 strings must be divisible by 4)
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  
  // Use atob() which is available in both Bun and browsers
  // Then decode UTF-8 using TextDecoder for proper Unicode handling
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Encode a UTF-8 string to URL-safe Base64.
 * This function is Bun-compatible and does not rely on Node.js Buffer APIs.
 * 
 * @param text - UTF-8 string to encode
 * @returns URL-safe Base64 encoded string (uses `-` and `_` instead of `+` and `/`)
 * 
 * @example
 * ```typescript
 * const encoded = encodeBase64Url('{"sub":"1234567890"}');
 * // Returns: 'eyJzdWIiOiIxMjM0NTY3ODkwIn0'
 * ```
 */
export function encodeBase64Url(text: string): string {
  // Encode UTF-8 string to bytes
  const bytes = new TextEncoder().encode(text);
  
  // Convert bytes to binary string
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  
  // Use btoa() which is available in both Bun and browsers
  // Then convert to URL-safe Base64
  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
