import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec,property}.{ts,tsx}'],
    exclude: [
      'tests/unit/api/**',
      'tests/integration/mime-types.integration.test.ts',
      'tests/property/admin-system-health-fixes/**',
      'tests/property/vercel-production-fixes/error-response.property.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@neondatabase/serverless': path.resolve(__dirname, './node_modules/@neondatabase/serverless'),
    },
  },
});
