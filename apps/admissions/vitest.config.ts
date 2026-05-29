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
