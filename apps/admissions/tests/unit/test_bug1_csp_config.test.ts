/**
 * Bug Condition Exploration Test — Bug 1: CSP Print CSS Inlined as data: URI
 *
 * Property 3: Bug Condition — Print CSS Inlined as data: URI
 *
 * This test encodes the EXPECTED (fixed) behavior:
 *   - vite.config.ts has assetsInlineLimit: 0 (prevents CSS inlining as data: URIs)
 *   - vercel.json CSP style-src does NOT contain 'data:' (tightened CSP)
 *
 * On UNFIXED code this test MUST FAIL because:
 *   - assetsInlineLimit is currently 4096 (not 0)
 *   - CSP currently includes 'data:' in style-src and style-src-elem
 *
 * Validates: Requirements 1.1, 1.2
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ADMISSIONS_ROOT = path.resolve(__dirname, '../..');

describe('Bug 1: CSP Print CSS — Bug Condition Exploration', () => {
  describe('Vite config: assetsInlineLimit must be 0', () => {
    it('should set assetsInlineLimit to 0 to prevent CSS inlining as data: URIs', () => {
      const viteConfigPath = path.join(ADMISSIONS_ROOT, 'vite.config.ts');
      const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');

      // Extract the assetsInlineLimit value from the config
      const match = viteConfig.match(/assetsInlineLimit\s*:\s*(\d+)/);
      expect(match).not.toBeNull();

      const assetsInlineLimit = Number(match![1]);

      // Expected behavior: assetsInlineLimit should be 0
      // Bug condition: assetsInlineLimit is 4096, causing print.css (~2.2KB) to be
      // inlined as a data:text/css;base64 URI, which requires 'data:' in CSP style-src
      expect(assetsInlineLimit).toBe(0);
    });
  });

  describe('Vercel CSP: style-src must NOT contain data:', () => {
    let cspHeader: string;

    beforeAll(() => {
      const vercelJsonPath = path.join(ADMISSIONS_ROOT, 'vercel.json');
      const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));

      // Find the CSP header in the catch-all route headers
      const catchAllHeaders = vercelJson.headers?.find(
        (h: { source: string }) => h.source === '/(.*)',
      );
      expect(catchAllHeaders).toBeDefined();

      const cspEntry = catchAllHeaders.headers.find(
        (h: { key: string }) => h.key === 'Content-Security-Policy',
      );
      expect(cspEntry).toBeDefined();

      cspHeader = cspEntry.value;
    });

    it('should NOT include data: in style-src directive', () => {
      // Extract the style-src directive (not style-src-elem)
      // Match "style-src" followed by values up to the next directive or end
      const styleSrcMatch = cspHeader.match(
        /style-src\s(?!-elem)(.*?)(?:;|$)/,
      );
      expect(styleSrcMatch).not.toBeNull();

      const styleSrcValue = styleSrcMatch![1];

      // Expected behavior: style-src should be "'self' 'unsafe-inline'" without data:
      // Bug condition: style-src includes 'data:' to work around inlined CSS
      expect(styleSrcValue).not.toContain('data:');
    });

    it('should NOT include data: in style-src-elem directive', () => {
      // Extract the style-src-elem directive
      const styleSrcElemMatch = cspHeader.match(
        /style-src-elem\s(.*?)(?:;|$)/,
      );
      expect(styleSrcElemMatch).not.toBeNull();

      const styleSrcElemValue = styleSrcElemMatch![1];

      // Expected behavior: style-src-elem should be "'self' 'unsafe-inline'" without data:
      // Bug condition: style-src-elem includes 'data:' to work around inlined CSS
      expect(styleSrcElemValue).not.toContain('data:');
    });
  });
});
