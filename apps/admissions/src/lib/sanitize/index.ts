/**
 * Unified Sanitization API
 * 
 * Canonical module for all sanitization functions.
 * Consolidated from: src/lib/sanitize.ts, src/lib/sanitizer.ts, src/lib/securityEnhancements.ts
 * 
 * NEVER create new sanitizer files — add functions here.
 */

/**
 * Sanitize string for safe HTML display by escaping special characters.
 * This is the strictest approach — no HTML tags are allowed.
 */
export function sanitizeForDisplay(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&#x27;';
      default: return char;
    }
  });
}

/**
 * Sanitize input for log output.
 * - Accepts any type (string, Error, object, etc.)
 * - Strips newlines and tabs to prevent log injection
 * - Truncates to 200 chars max to prevent log flooding
 * - Never includes PII
 */
export function sanitizeForLog(input: unknown): string {
  if (input === null || input === undefined) return 'null';
  if (typeof input === 'string') return input.replace(/[\r\n\t]/g, ' ').substring(0, 200);
  if (input instanceof Error) return input.message.replace(/[\r\n\t]/g, ' ').substring(0, 200);
  return String(input).replace(/[\r\n\t]/g, ' ').substring(0, 200);
}

/**
 * Sanitize plain text by removing dangerous characters.
 * Strips HTML/script injection chars and control characters.
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[<>"'`\\\x00-\x1f\x7f-\x9f]/g, '').substring(0, 5000);
}

/**
 * Sanitize HTML content, allowing only safe tags.
 * Uses a whitelist approach — only explicitly allowed tags/attributes pass through.
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';
  // Strip all tags except whitelisted ones
  const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a', 'span'];
  const ALLOWED_ATTRS = ['href', 'target', 'rel', 'class'];

  // Remove script tags and event handlers first
  let cleaned = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '');

  // Strip disallowed tags but keep content
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  cleaned = cleaned.replace(tagPattern, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) return '';

    // For allowed tags, strip disallowed attributes
    if (match.startsWith('</')) return `</${tag}>`;

    const attrPattern = /\s([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let attrs = '';
    let attrMatch;
    while ((attrMatch = attrPattern.exec(match)) !== null) {
      const attrName = attrMatch[1]!.toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      if (ALLOWED_ATTRS.includes(attrName)) {
        // Prevent javascript: URLs in href
        if (attrName === 'href' && /^\s*javascript:/i.test(attrValue)) continue;
        attrs += ` ${attrName}="${sanitizeForDisplay(attrValue)}"`;
      }
    }
    return `<${tag}${attrs}>`;
  });

  return cleaned;
}

/**
 * Sanitize file path to prevent path traversal attacks.
 */
export function sanitizeFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') return '';
  return filePath
    .replace(/\.\./g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/^\/+/, '')
    .substring(0, 255);
}

/**
 * Sanitize email address — lowercase, trim, remove invalid chars.
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '');
}

/**
 * Safely parse JSON with a fallback value.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * SecuritySanitizer class — consolidated from securityConfig and securityEnhancements.
 * Provides object-level sanitization and filename sanitization.
 */
export class SecuritySanitizer {
  static readonly MAX_STRING_LENGTH = 1000;
  static readonly MAX_ARRAY_LENGTH = 100;

  static sanitizeHtml(input: string): string {
    return sanitizeHtml(input);
  }

  static sanitizeString(input: string, maxLength: number = SecuritySanitizer.MAX_STRING_LENGTH): string {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>"'`\\]/g, '').trim().substring(0, maxLength);
  }

  static sanitizeFilename(filename: string): string {
    if (typeof filename !== 'string') return 'file';
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '')
      .substring(0, 255);
  }

  static sanitizeObject(obj: unknown, maxDepth: number = 5): unknown {
    if (maxDepth <= 0) return null;
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return this.sanitizeString(obj);
    if (typeof obj === 'number') return isFinite(obj) ? obj : 0;
    if (typeof obj === 'boolean') return obj;
    if (Array.isArray(obj)) {
      return obj.slice(0, this.MAX_ARRAY_LENGTH).map(item => this.sanitizeObject(item, maxDepth - 1));
    }
    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      const keys = Object.keys(obj as Record<string, unknown>).slice(0, 50);
      for (const key of keys) {
        const sanitizedKey = this.sanitizeString(key, 100);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeObject((obj as Record<string, unknown>)[key], maxDepth - 1);
        }
      }
      return sanitized;
    }
    return null;
  }
}
