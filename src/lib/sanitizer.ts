// Input sanitization utilities
export const sanitizeForLog = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[\r\n\t\x00-\x1f\x7f-\x9f]/g, ' ').replace(/[<>"'`\\]/g, '').substring(0, 1000);
};

export const sanitizeHtml = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#x60;')
    .replace(/\\/g, '&#x5C;')
    .substring(0, 10000);
};

export const sanitizeText = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[<>"'`\\\x00-\x1f\x7f-\x9f]/g, '').substring(0, 5000);
};