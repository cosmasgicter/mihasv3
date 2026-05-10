/**
 * Retired test — the `@/lib/documentTemplates` module it targeted was never
 * built. The PDF redesign migration (May 2026) replaced the unbuilt HTML+PDF
 * dual-output approach with three focused generators under `@/lib/pdf`.
 *
 * Equivalent coverage now lives in:
 *   - tests/unit/pdf/applicationSlip.test.tsx
 *   - tests/unit/pdf/paymentReceipt.test.tsx
 *   - tests/unit/pdf/acceptanceLetter.test.tsx
 *   - tests/unit/pdf/primitives.test.tsx
 *   - tests/unit/pdf/theme.test.ts
 *
 * This file is kept as a skipped suite for one release so git-history readers
 * can trace the migration. It will be deleted in Task 11.
 */

import { describe, it } from 'vitest'

describe.skip('document template premium shell — retired', () => {
  it('coverage moved to tests/unit/pdf/*.test.tsx', () => {})
})
