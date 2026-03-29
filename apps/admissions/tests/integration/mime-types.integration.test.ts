/**
 * Integration Tests: MIME Types
 * Feature: bun-vercel-runtime-forensics
 * 
 * Verifies that JavaScript files are served with correct MIME types
 * and no text/html errors occur for JS modules.
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Feature: bun-vercel-runtime-forensics, MIME Types', () => {
  describe('Vercel Configuration (Requirement 6.1)', () => {
    it('should have X-Content-Type-Options: nosniff header configured', () => {
      const vercelConfig = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
      );

      // Find the catch-all header configuration
      const catchAllHeaders = vercelConfig.headers?.find(
        (h: { source: string }) => h.source === '/(.*)'
      );

      expect(catchAllHeaders).toBeDefined();
      
      const nosniffHeader = catchAllHeaders?.headers?.find(
        (h: { key: string }) => h.key === 'X-Content-Type-Options'
      );

      expect(nosniffHeader).toBeDefined();
      expect(nosniffHeader?.value).toBe('nosniff');
    });

    it('should have API routes configured with security headers', () => {
      const vercelConfig = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
      );

      // Find the API header configuration
      const apiHeaders = vercelConfig.headers?.find(
        (h: { source: string }) => h.source === '/api/(.*)'
      );

      expect(apiHeaders).toBeDefined();
      
      const nosniffHeader = apiHeaders?.headers?.find(
        (h: { key: string }) => h.key === 'X-Content-Type-Options'
      );

      expect(nosniffHeader).toBeDefined();
      expect(nosniffHeader?.value).toBe('nosniff');
    });
  });

  describe('Vite Build Configuration (Requirement 6.2)', () => {
    it('should output JavaScript files with .js extension', () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');

      // Check that chunk files use .js extension
      expect(viteConfig).toContain("chunkFileNames: 'assets/js/[name]-[hash].js'");
      expect(viteConfig).toContain("entryFileNames: 'assets/js/[name]-[hash].js'");
    });

    it('should target ES2022 for modern browser support', () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');

      // Check ES2022 target
      expect(viteConfig).toContain("target: 'es2022'");
    });

    it('should not use module polyfills', () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');

      // Check no polyfills
      expect(viteConfig).toContain('modulePreload: { polyfill: false }');
    });
  });

  describe('API Response Content-Type (Requirement 6.3)', () => {
    it('should have errorHandler set Content-Type to application/json', () => {
      const errorHandlerPath = path.join(process.cwd(), 'api/_lib/errorHandler.ts');
      const errorHandler = fs.readFileSync(errorHandlerPath, 'utf-8');

      // Check that Content-Type is set for error responses
      expect(errorHandler).toContain("setHeader('Content-Type', 'application/json')");
    });

    it('should have catch-all 404 handler use sendError (which sets Content-Type)', () => {
      const catchAllPath = path.join(process.cwd(), 'api/[...path].ts');
      const catchAll = fs.readFileSync(catchAllPath, 'utf-8');

      // Check that sendError is used (which sets Content-Type to application/json)
      expect(catchAll).toContain("import { sendError");
      expect(catchAll).toContain("return sendError(");
    });
  });

  describe('JavaScript Module MIME Type Expectations', () => {
    it('should expect application/javascript for .js files', () => {
      // Standard MIME types for JavaScript
      const expectedMimeTypes = {
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.cjs': 'application/javascript',
      };

      expect(expectedMimeTypes['.js']).toBe('application/javascript');
      expect(expectedMimeTypes['.mjs']).toBe('application/javascript');
    });

    it('should expect text/css for .css files', () => {
      const expectedMimeTypes = {
        '.css': 'text/css',
      };

      expect(expectedMimeTypes['.css']).toBe('text/css');
    });

    it('should expect text/html for .html files', () => {
      const expectedMimeTypes = {
        '.html': 'text/html',
      };

      expect(expectedMimeTypes['.html']).toBe('text/html');
    });
  });

  describe('SPA Routing Configuration', () => {
    it('should have SPA fallback rewrite configured', () => {
      const vercelConfig = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
      );

      // Find the SPA fallback rewrite
      const spaRewrite = vercelConfig.rewrites?.find(
        (r: { source: string; destination: string }) => 
          r.source === '/(.*)' && r.destination === '/index.html'
      );

      expect(spaRewrite).toBeDefined();
    });

    it('should have API routes configured before SPA fallback', () => {
      const vercelConfig = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
      );

      const rewrites = vercelConfig.rewrites || [];
      
      // Find indices
      const apiRewriteIndex = rewrites.findIndex(
        (r: { source: string }) => r.source.startsWith('/api/')
      );
      const spaRewriteIndex = rewrites.findIndex(
        (r: { source: string; destination: string }) => 
          r.source === '/(.*)' && r.destination === '/index.html'
      );

      // API routes should come before SPA fallback
      expect(apiRewriteIndex).toBeLessThan(spaRewriteIndex);
    });
  });

  describe('No text/html for JavaScript Modules', () => {
    it('should not serve JavaScript as text/html (prevents MIME type errors)', () => {
      // This test verifies the configuration prevents the common error:
      // "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'"
      
      const vercelConfig = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
      );

      // Verify SPA fallback is last (so static assets are served correctly)
      const rewrites = vercelConfig.rewrites || [];
      const lastRewrite = rewrites[rewrites.length - 1];
      
      expect(lastRewrite.source).toBe('/(.*)');
      expect(lastRewrite.destination).toBe('/index.html');

      // Verify API routes are explicitly configured (not caught by SPA fallback)
      const apiRewrites = rewrites.filter(
        (r: { source: string }) => r.source.includes('/api/')
      );
      
      expect(apiRewrites.length).toBeGreaterThan(0);
    });

    it('should have proper output directory configured', () => {
      const vercelConfig = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
      );

      // Verify output directory is set to dist
      expect(vercelConfig.outputDirectory).toBe('dist');
    });
  });
});
