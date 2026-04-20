/**
 * Preservation Property Tests — Bug 1: Non-CSS Asset Behavior Unchanged
 *
 * Property 4: Preservation — CSS Files Above Limit Still Separate
 *
 * These tests verify existing correct behavior that MUST be preserved
 * after the Bug 1 fix (changing assetsInlineLimit from 4096 to 0):
 *   - The Vite config structure is valid and other build options are unchanged
 *   - CSS files larger than the inline limit are emitted as separate files (cssCodeSplit: true)
 *   - With assetsInlineLimit: 0, ALL assets will be emitted as separate files
 *     (intended trade-off per design doc: "negligible with HTTP/2 and immutable cache headers")
 *
 * These tests MUST PASS on UNFIXED code (assetsInlineLimit: 4096).
 *
 * Validates: Requirements 3.1, 3.2
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ADMISSIONS_ROOT = path.resolve(__dirname, '../..');

describe('Bug 1: Preservation — Vite Config Structure and Build Options', () => {
  const viteConfigPath = path.join(ADMISSIONS_ROOT, 'vite.config.ts');
  let viteConfig: string;

  beforeAll(() => {
    viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');
  });

  it('should have a valid vite.config.ts file that exports a defineConfig call', () => {
    expect(viteConfig).toContain('defineConfig');
    expect(viteConfig).toContain('export default');
  });

  it('should preserve build target as es2022', () => {
    const match = viteConfig.match(/target\s*:\s*['"](\w+)['"]/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('es2022');
  });

  it('should preserve minify as terser', () => {
    const match = viteConfig.match(/minify\s*:\s*['"](\w+)['"]/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('terser');
  });

  it('should preserve sourcemap as false for production builds', () => {
    expect(viteConfig).toMatch(/sourcemap\s*:\s*false/);
  });

  it('should preserve chunkSizeWarningLimit at 650', () => {
    const match = viteConfig.match(/chunkSizeWarningLimit\s*:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(650);
  });

  it('should preserve cssCodeSplit as true so large CSS files are emitted separately', () => {
    // This is the key preservation property: CSS code splitting ensures
    // CSS files above the inline limit are always emitted as separate files.
    // This behavior must remain unchanged regardless of assetsInlineLimit value.
    expect(viteConfig).toMatch(/cssCodeSplit\s*:\s*true/);
  });

  it('should preserve reportCompressedSize as false for faster builds', () => {
    expect(viteConfig).toMatch(/reportCompressedSize\s*:\s*false/);
  });

  it('should preserve modulePreload polyfill disabled', () => {
    expect(viteConfig).toMatch(/modulePreload\s*:\s*\{\s*polyfill\s*:\s*false\s*\}/);
  });

  it('should have assetsInlineLimit defined as a numeric value', () => {
    // Preservation: assetsInlineLimit must exist and be a number.
    // The actual value may change (4096 → 0) but the setting must be present.
    const match = viteConfig.match(/assetsInlineLimit\s*:\s*(\d+)/);
    expect(match).not.toBeNull();
    const value = Number(match![1]);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it('should preserve terser compression options (drop_console, drop_debugger)', () => {
    expect(viteConfig).toMatch(/drop_console\s*:\s*true/);
    expect(viteConfig).toMatch(/drop_debugger\s*:\s*true/);
  });

  it('should preserve manual chunk splitting for heavy vendor libraries', () => {
    // These vendor chunks must remain to keep bundle sizes manageable
    expect(viteConfig).toContain('vendor-excel');
    expect(viteConfig).toContain('vendor-pdf');
    expect(viteConfig).toContain('vendor-ocr');
    expect(viteConfig).toContain('vendor-charts');
    expect(viteConfig).not.toContain('vendor-location-data');
    expect(viteConfig).not.toContain('country-state-city');
  });
});

describe('Bug 1: Preservation — Vercel Headers and Non-CSP Config', () => {
  let vercelJson: Record<string, unknown>;

  beforeAll(() => {
    const vercelJsonPath = path.join(ADMISSIONS_ROOT, 'vercel.json');
    vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
  });

  it('should preserve immutable cache headers for /assets/ path', () => {
    const headers = vercelJson.headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    const assetsHeaders = headers.find((h) => h.source === '/assets/(.*)');
    expect(assetsHeaders).toBeDefined();

    const cacheControl = assetsHeaders!.headers.find((h) => h.key === 'Cache-Control');
    expect(cacheControl).toBeDefined();
    expect(cacheControl!.value).toContain('immutable');
    expect(cacheControl!.value).toContain('max-age=31536000');
  });

  it('should preserve SPA rewrite rule for client-side routing', () => {
    const rewrites = vercelJson.rewrites as Array<{ source: string; destination: string }>;
    expect(rewrites).toBeDefined();
    expect(rewrites.length).toBeGreaterThan(0);

    const spaRewrite = rewrites.find((r) => r.destination === '/index.html');
    expect(spaRewrite).toBeDefined();
  });

  it('should preserve security headers (X-Content-Type-Options, X-Frame-Options, HSTS)', () => {
    const headers = vercelJson.headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    const catchAll = headers.find((h) => h.source === '/(.*)');
    expect(catchAll).toBeDefined();

    const headerMap = new Map(catchAll!.headers.map((h) => [h.key, h.value]));
    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headerMap.get('X-Frame-Options')).toBe('DENY');
    expect(headerMap.get('Strict-Transport-Security')).toContain('max-age=31536000');
  });

  it('should preserve img-src allowing self, data:, and blob: in CSP', () => {
    // img-src must continue to allow data: for inlined images — this is NOT affected by Bug 1 fix
    const headers = vercelJson.headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    const catchAll = headers.find((h) => h.source === '/(.*)');
    const csp = catchAll!.headers.find((h) => h.key === 'Content-Security-Policy');
    expect(csp).toBeDefined();

    const imgSrcMatch = csp!.value.match(/img-src\s(.*?)(?:;|$)/);
    expect(imgSrcMatch).not.toBeNull();
    expect(imgSrcMatch![1]).toContain("'self'");
    expect(imgSrcMatch![1]).toContain('data:');
    expect(imgSrcMatch![1]).toContain('blob:');
  });
});

describe('Bug 1: Preservation — assetsInlineLimit trade-off with HTTP/2', () => {
  it('should have immutable cache headers configured so extra requests from assetsInlineLimit: 0 are negligible', () => {
    // Per design doc: "The trade-off is slightly more HTTP requests for small assets,
    // but this is negligible with HTTP/2 and immutable cache headers already configured"
    //
    // This test verifies the infrastructure that makes assetsInlineLimit: 0 a safe trade-off:
    // immutable caching on /assets/ means browsers cache aggressively after first load.
    const vercelJsonPath = path.join(ADMISSIONS_ROOT, 'vercel.json');
    const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));

    const headers = vercelJson.headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    const assetsHeaders = headers.find((h) => h.source === '/assets/(.*)');
    expect(assetsHeaders).toBeDefined();

    const cacheControl = assetsHeaders!.headers.find((h) => h.key === 'Cache-Control');
    expect(cacheControl).toBeDefined();
    // Must have both public + immutable for HTTP/2 to make extra requests negligible
    expect(cacheControl!.value).toContain('public');
    expect(cacheControl!.value).toContain('immutable');
  });

  it('should have asset file naming with content hashes for cache busting', () => {
    // Vite config must use [hash] in asset filenames so immutable caching works correctly
    const viteConfigPath = path.join(ADMISSIONS_ROOT, 'vite.config.ts');
    const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');

    // Check that asset, chunk, and entry filenames include [hash]
    // assetFileNames is a function that returns strings with [hash], so check the template strings
    expect(viteConfig).toContain('[hash]');
    expect(viteConfig).toContain('chunkFileNames');
    expect(viteConfig).toContain('entryFileNames');
    expect(viteConfig).toContain('assetFileNames');
    // Verify the chunk and entry patterns use [hash] in their string values
    expect(viteConfig).toMatch(/chunkFileNames\s*:\s*'[^']*\[hash\][^']*'/);
    expect(viteConfig).toMatch(/entryFileNames\s*:\s*'[^']*\[hash\][^']*'/);
  });
});
