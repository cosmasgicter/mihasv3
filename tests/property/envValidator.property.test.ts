/**
 * Property Tests for Environment Variable Validation — P24
 *
 * Feature: website-quality-remediation, Property 24: Environment variable validation
 *
 * For any subset of the required environment variables (DATABASE_URL, JWT_SECRET,
 * JWT_REFRESH_SECRET, ARCJET_KEY), the validator should correctly identify all
 * missing or empty variables and produce a descriptive error naming each one.
 * Additionally, DATABASE_URL must start with postgres:// or postgresql://, and
 * JWT secrets must be at least 32 characters long.
 *
 * **Validates: Requirements 25.1, 25.2, 25.3, 25.4**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  validateServerEnv,
  validateDatabaseUrl,
  validateJwtSecret,
} from '../../lib/envValidator'

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ARCJET_KEY',
] as const

/** Save and restore process.env around each test */
let envBackup: Record<string, string | undefined>

beforeEach(() => {
  envBackup = {}
  for (const v of REQUIRED_VARS) {
    envBackup[v] = process.env[v]
  }
})

afterEach(() => {
  for (const v of REQUIRED_VARS) {
    if (envBackup[v] === undefined) {
      delete process.env[v]
    } else {
      process.env[v] = envBackup[v]
    }
  }
})

/** Arbitrary that generates a valid postgres URL */
const validDbUrl = fc.oneof(
  fc.webUrl().map((u) => `postgres://${u.replace(/^https?:\/\//, '')}`),
  fc.webUrl().map((u) => `postgresql://${u.replace(/^https?:\/\//, '')}`),
)

/** Arbitrary that generates a string of at least 32 chars */
const validSecret = fc.string({ minLength: 32, maxLength: 128 })

/** Arbitrary that generates a non-empty string for ARCJET_KEY */
const validArcjetKey = fc.string({ minLength: 1, maxLength: 64 })

/** Set all env vars to valid values */
function setAllValid(dbUrl: string, jwtSecret: string, jwtRefresh: string, arcjetKey: string) {
  process.env.DATABASE_URL = dbUrl
  process.env.JWT_SECRET = jwtSecret
  process.env.JWT_REFRESH_SECRET = jwtRefresh
  process.env.ARCJET_KEY = arcjetKey
}

/** Clear all required env vars */
function clearAll() {
  for (const v of REQUIRED_VARS) delete process.env[v]
}

describe('Environment Variable Validation Property Tests (P24)', () => {
  describe('P24.1: All valid env vars produce valid result', () => {
    it('returns valid: true when all required vars are present and correctly formatted', () => {
      fc.assert(
        fc.property(
          validDbUrl,
          validSecret,
          validSecret,
          validArcjetKey,
          (dbUrl, jwtSecret, jwtRefresh, arcjetKey) => {
            setAllValid(dbUrl, jwtSecret, jwtRefresh, arcjetKey)
            const result = validateServerEnv()
            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('P24.2: Missing vars are identified by name', () => {
    it('reports every missing variable in the errors list', () => {
      // Generate a random subset of vars to remove
      const subsetArb = fc.subarray([...REQUIRED_VARS], { minLength: 1 })

      fc.assert(
        fc.property(
          subsetArb,
          validDbUrl,
          validSecret,
          validSecret,
          validArcjetKey,
          (missingVars, dbUrl, jwtSecret, jwtRefresh, arcjetKey) => {
            setAllValid(dbUrl, jwtSecret, jwtRefresh, arcjetKey)
            // Remove the selected subset
            for (const v of missingVars) delete process.env[v]

            const result = validateServerEnv()
            expect(result.valid).toBe(false)

            // Each missing var should appear in the errors
            const errorVarNames = result.errors.map((e) => e.variable)
            for (const v of missingVars) {
              expect(errorVarNames).toContain(v)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('P24.3: Empty strings treated as missing', () => {
    it('rejects empty or whitespace-only values', () => {
      const emptyish = fc.oneof(
        fc.constant(''),
        fc.constant('   '),
        fc.constant('\t'),
        fc.constant('\n'),
      )

      fc.assert(
        fc.property(
          fc.constantFrom(...REQUIRED_VARS),
          emptyish,
          validDbUrl,
          validSecret,
          validSecret,
          validArcjetKey,
          (varName, emptyVal, dbUrl, jwtSecret, jwtRefresh, arcjetKey) => {
            setAllValid(dbUrl, jwtSecret, jwtRefresh, arcjetKey)
            process.env[varName] = emptyVal

            const result = validateServerEnv()
            expect(result.valid).toBe(false)
            const errorVarNames = result.errors.map((e) => e.variable)
            expect(errorVarNames).toContain(varName)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('P24.4: DATABASE_URL format validation', () => {
    it('accepts URLs starting with postgres:// or postgresql://', () => {
      fc.assert(
        fc.property(validDbUrl, (url) => {
          expect(validateDatabaseUrl(url)).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects URLs with other schemes', () => {
      const badSchemes = fc.oneof(
        fc.constant('mysql://host/db'),
        fc.constant('http://host/db'),
        fc.constant('sqlite:///path'),
        fc.webUrl(), // random http/https URLs
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !s.startsWith('postgres://') && !s.startsWith('postgresql://'),
        ),
      )

      fc.assert(
        fc.property(badSchemes, (url) => {
          expect(validateDatabaseUrl(url)).toBe(false)
        }),
        { numRuns: 100 },
      )
    })

    it('reports format error when DATABASE_URL has wrong prefix', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            (s) =>
              !s.startsWith('postgres://') &&
              !s.startsWith('postgresql://') &&
              s.trim().length > 0,
          ),
          validSecret,
          validSecret,
          validArcjetKey,
          (badDbUrl, jwtSecret, jwtRefresh, arcjetKey) => {
            setAllValid(badDbUrl, jwtSecret, jwtRefresh, arcjetKey)

            const result = validateServerEnv()
            expect(result.valid).toBe(false)
            const dbError = result.errors.find((e) => e.variable === 'DATABASE_URL')
            expect(dbError).toBeDefined()
            expect(dbError!.message).toContain('postgres://')
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('P24.5: JWT secret length validation', () => {
    it('accepts secrets >= 32 characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 32, maxLength: 256 }),
          (secret) => {
            expect(validateJwtSecret(secret)).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('rejects secrets < 32 characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 31 }),
          (secret) => {
            expect(validateJwtSecret(secret)).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('reports length error when JWT secrets are too short', () => {
      // Generate non-whitespace-only short secrets so the validator reaches
      // the length check rather than the "missing or empty" check.
      const shortNonEmptySecret = fc
        .string({ minLength: 1, maxLength: 31 })
        .filter((s) => s.trim().length > 0)

      fc.assert(
        fc.property(
          fc.constantFrom('JWT_SECRET', 'JWT_REFRESH_SECRET') as fc.Arbitrary<'JWT_SECRET' | 'JWT_REFRESH_SECRET'>,
          shortNonEmptySecret,
          validDbUrl,
          validSecret,
          validArcjetKey,
          (varName, shortSecret, dbUrl, longSecret, arcjetKey) => {
            setAllValid(dbUrl, longSecret, longSecret, arcjetKey)
            process.env[varName] = shortSecret

            const result = validateServerEnv()
            expect(result.valid).toBe(false)
            const jwtError = result.errors.find((e) => e.variable === varName)
            expect(jwtError).toBeDefined()
            expect(jwtError!.message).toContain('32')
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
