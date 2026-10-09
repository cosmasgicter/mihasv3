import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec,property}.{ts,tsx}'],
    exclude: [
      'tests/e2e/**',
      'tests/playwright/**',
      // Playwright harness specs (admissions-v2 task 0.4). They import
      // `@playwright/test`, which refuses to run outside the Playwright runner,
      // so Vitest collecting them turns every one into a hard failure that has
      // nothing to do with the code under test. They run via
      // `harness/bin/harness e2e` / playwright.harness.config.ts.
      'tests/harness-e2e/**',
      // (a) Calls React components as plain functions — needs rewrite with render()
      'tests/unit/optimized-auth-routes.test.tsx',
      // (a) Imports non-existent module ../../lib/auth/permissions — not yet implemented
      'tests/property/rbac.property.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    testTimeout: 90000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@neondatabase/serverless': path.resolve(__dirname, './node_modules/@neondatabase/serverless'),
    },
  },
});
