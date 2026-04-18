import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Dead code removal verification — ensures stale field names
 * `total_capacity` and `available_spots` are not used as API field names
 * in active frontend code.
 *
 * Validates: Requirements 10.1, 10.2, 11.1
 */

const ROOT = resolve(__dirname, '../../');

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

/**
 * Strip single-line comments (// ...) and block comments so that
 * documentation references don't trigger false positives.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('dead code removal verification', () => {
  describe('catalog.ts has no stale field references', () => {
    const content = stripComments(readSource('src/services/catalog.ts'));

    it('does not reference total_capacity as a field name', () => {
      expect(content).not.toMatch(/\btotal_capacity\b/);
    });

    it('does not reference available_spots as a field name', () => {
      expect(content).not.toMatch(/\bavailable_spots\b/);
    });
  });

  describe('Intakes.tsx has no stale field references', () => {
    const content = stripComments(readSource('src/pages/admin/Intakes.tsx'));

    it('does not reference total_capacity as a field name', () => {
      expect(content).not.toMatch(/\btotal_capacity\b/);
    });

    it('does not reference available_spots as a field name', () => {
      expect(content).not.toMatch(/\bavailable_spots\b/);
    });
  });

  describe('active frontend code uses correct field names', () => {
    it('catalog.ts Intake interface uses max_capacity', () => {
      const content = readSource('src/services/catalog.ts');
      expect(content).toMatch(/max_capacity:\s*number/);
    });

    it('catalog.ts Intake interface uses current_enrollment', () => {
      const content = readSource('src/services/catalog.ts');
      expect(content).toMatch(/current_enrollment\??\s*:\s*number/);
    });

    it('Intakes.tsx uses max_capacity in the Zod schema', () => {
      const content = readSource('src/pages/admin/Intakes.tsx');
      expect(content).toMatch(/max_capacity:\s*z\./);
    });
  });
});
