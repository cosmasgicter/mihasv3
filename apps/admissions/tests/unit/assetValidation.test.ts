/**
 * Feature: migration-recovery-hardening, Property 14: All PWA precache and fallback paths reference existing assets
 *
 * **Validates: Requirements 12.1, 12.2, 12.3**
 *
 * Iterates PWA_CONFIG.precache and fallback paths, verifies each file exists in public/.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

import { PWA_CONFIG } from '../../src/lib/pwaConfig';

const publicDir = resolve(__dirname, '../../public');

describe('Property 14: PWA asset path validation', () => {
  it('all precache paths reference existing files', () => {
    for (const path of PWA_CONFIG.precache) {
      // '/' maps to index.html at project root, skip it
      if (path === '/') continue;

      const filePath = resolve(publicDir, path.replace(/^\//, ''));
      expect(existsSync(filePath), `Missing precache asset: ${path}`).toBe(true);
    }
  });

  it('all fallback paths reference existing files', () => {
    const fallbacks = PWA_CONFIG.fallbacks;
    const paths = [fallbacks.page, fallbacks.image].filter(Boolean) as string[];

    for (const path of paths) {
      const filePath = resolve(publicDir, path.replace(/^\//, ''));
      expect(existsSync(filePath), `Missing fallback asset: ${path}`).toBe(true);
    }
  });

  it('precache list includes critical offline resources', () => {
    expect(PWA_CONFIG.precache).toContain('/offline.html');
    expect(PWA_CONFIG.precache).toContain('/manifest.json');
    expect(PWA_CONFIG.precache).toContain('/favicon.ico');
  });
});
