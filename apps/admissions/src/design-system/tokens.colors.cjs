/**
 * Shared admin color values — single source of truth.
 *
 * This file uses .cjs because the package has "type": "module",
 * and tailwind.config.js needs CommonJS require().
 *
 * Both tailwind.config.js and tokens.ts consume these values
 * so admin colors are never duplicated.
 */

/** @type {Record<string, string>} */
const adminColors = {
  bg: '#f9fafb',
  card: '#ffffff',
  border: '#858c98',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
}

module.exports = { adminColors }
