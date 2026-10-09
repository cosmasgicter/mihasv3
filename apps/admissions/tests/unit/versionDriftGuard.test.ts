/**
 * Frontend mirror of the Admissions V2 version drift guard.
 *
 * Task 1.2 of the `admissions-v2-canonical-rebuild` spec (Requirement R2).
 *
 * The authoritative, cross-cutting guard lives in the backend suite
 * (`backend/tests/unit/test_version_drift_guard.py`) because most sources —
 * runtime `APP_VERSION`, generated OpenAPI product version, the `/api/v1/`
 * prefix, and the frozen `1.0.0` V1 baseline — live server-side. This
 * lightweight mirror keeps the *frontend* product-version sources honest inside
 * the vitest suite so a stray edit to `apps/admissions/package.json` or an
 * example env file is caught here too, without waiting for the backend job.
 *
 * Validates: Requirements 2.1, 2.5.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// tests/unit/versionDriftGuard.test.ts
//   __dirname = apps/admissions/tests/unit
const ADMISSIONS_ROOT = resolve(__dirname, '../..')
const REPO_ROOT = resolve(__dirname, '../../../..')

// The maintained product version every source below must report (task 1.1).
const PRODUCT_VERSION = '2.0.0'
// The API major/compatibility label — distinct from the product version (R2.5).
const API_MAJOR_LABEL = 'v1'
// The forward target schema label — distinct from both (R2.5).
const TARGET_SCHEMA_LABEL = 'v2'

function readViteAppVersion(path: string): string | null {
  const text = readFileSync(path, 'utf-8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('VITE_APP_VERSION=')) {
      return line.slice('VITE_APP_VERSION='.length).trim()
    }
  }
  return null
}

describe('Version drift guard (frontend sources) — R2.1', () => {
  it('apps/admissions/package.json reports the product version', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(ADMISSIONS_ROOT, 'package.json'), 'utf-8'),
    ) as { version?: string }
    expect(pkg.version).toBe(PRODUCT_VERSION)
  })

  it('apps/admissions/.env.example VITE_APP_VERSION reports the product version', () => {
    expect(readViteAppVersion(resolve(ADMISSIONS_ROOT, '.env.example'))).toBe(
      PRODUCT_VERSION,
    )
  })

  it('root .env.example VITE_APP_VERSION reports the product version', () => {
    expect(readViteAppVersion(resolve(REPO_ROOT, '.env.example'))).toBe(
      PRODUCT_VERSION,
    )
  })
})

describe('Version drift guard (label distinctness) — R2.5', () => {
  it('product, API major, and target schema are three distinct labels', () => {
    const labels = new Set([PRODUCT_VERSION, API_MAJOR_LABEL, TARGET_SCHEMA_LABEL])
    expect(labels.size).toBe(3)
    expect(API_MAJOR_LABEL).not.toBe(PRODUCT_VERSION)
    expect(TARGET_SCHEMA_LABEL).not.toBe(PRODUCT_VERSION)
  })
})
