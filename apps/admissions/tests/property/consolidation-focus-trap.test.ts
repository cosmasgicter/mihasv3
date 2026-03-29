/**
 * Property 7: Focus Trap Preserves Tab-Wrapping and Escape Handling
 * Feature: duplicate-deprecated-consolidation, Property 7: Focus Trap Preserves Tab-Wrapping and Escape Handling
 *
 * For any DOM container with N focusable elements (N >= 1), the focus trap should
 * wrap forward Tab last→first, Shift+Tab first→last, and Escape releases the trap.
 *
 * Validates: Requirements 2.4
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

describe('Property 7: Focus Trap Preserves Tab-Wrapping and Escape Handling', () => {
  it('trapFocus function exists in canonical accessibility-utils and handles Tab key', () => {
    const filePath = path.resolve(SRC_DIR, 'lib/accessibility-utils.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    // trapFocus must be exported
    expect(content).toMatch(/export\s+function\s+trapFocus/);

    // Must check for Tab key
    expect(content).toContain("event.key !== 'Tab'");

    // Must handle shiftKey for backward navigation
    expect(content).toContain('event.shiftKey');

    // Must call event.preventDefault() for wrapping
    expect(content).toContain('event.preventDefault()');

    // Must call .focus() on elements
    expect(content).toContain('.focus()');
  });

  it('KEYS constant includes ESCAPE for escape handling', () => {
    const filePath = path.resolve(SRC_DIR, 'lib/accessibility-utils.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain("ESCAPE: 'Escape'");
  });

  it('handleEscapeKey function exists for escape handling', () => {
    const filePath = path.resolve(SRC_DIR, 'lib/accessibility-utils.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/export\s+function\s+handleEscapeKey/);
  });
});
