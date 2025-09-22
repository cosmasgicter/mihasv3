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

export const sanitizeText = sanitizeForDisplay;

export function sanitizeForLog(input: any): string {
  if (input === null || input === undefined) return 'null';
  if (typeof input === 'string') return input.replace(/[\r\n\t]/g, ' ').substring(0, 200);
  if (input instanceof Error) return input.message.replace(/[\r\n\t]/g, ' ').substring(0, 200);
  return String(input).replace(/[\r\n\t]/g, ' ').substring(0, 200);
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export { getSecureId, getSecureId as generateSecureId } from './security';

export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '');
}