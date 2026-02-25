// Input sanitization utilities
import DOMPurify from 'dompurify';

export const sanitizeForLog = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[\r\n\t\x00-\x1f\x7f-\x9f]/g, ' ').replace(/[<>"'`\\]/g, '').substring(0, 1000);
};

export const sanitizeHtml = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  });
};

export const sanitizeText = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[<>"'`\\\x00-\x1f\x7f-\x9f]/g, '').substring(0, 5000);
};