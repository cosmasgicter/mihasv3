import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec,property}.{ts,tsx}'],
    exclude: [
      'tests/e2e/**',
      'tests/integration/email-check.integration.test.ts',
      'tests/unit/optimized-auth-routes.test.tsx',
      'tests/unit/audit-remediation-code-structure.test.ts',
      'tests/unit/auditTrailCompleteness.test.ts',
      'tests/unit/doubleSubmit.test.ts',
      'tests/unit/generateIdempotencyKey.test.ts',
      'tests/unit/adminReportTemplatesLegacyEndpointGuard.test.ts',
      'tests/property/admin-users-registration-bugfix-*.test.ts',
      'tests/property/audit-remediation-*.test.ts',
      'tests/property/batchQuery.property.test.ts',
      'tests/property/rbac.property.test.ts',
      'tests/property/idempotencyDedup.property.test.ts',
      'tests/property/rateLimiting.property.test.ts',
      'tests/property/admin-system-health-fixes/**',
      'tests/property/api-hardening/**',
      'tests/property/production-readiness-audit/**',
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
