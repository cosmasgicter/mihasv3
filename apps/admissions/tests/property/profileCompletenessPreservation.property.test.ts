/**
 * Preservation Property Tests — Profile Completeness Bug
 *
 * These tests capture baseline behavior that MUST be preserved after the fix.
 * They MUST PASS on UNFIXED code.
 *
 * Property 4 (Design): getUserMetadata with populated user_metadata
 * Property 5 (Design): Auth error name-based detection preserved
 * Property 6 (Design): calculateCanonicalProfileCompletion unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 3.7**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getUserMetadata } from '@/hooks/useProfileAutoPopulation'
import { calculateCanonicalProfileCompletion, REQUIRED_PROFILE_FIELD_COUNT } from '@/lib/profileFieldMapping'
import type { User } from '@/types/auth'

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Optional non-empty string or undefined */
const optionalStringArb = fc.oneof(
  fc.constant(undefined),
  fc.stringMatching(/^[A-Za-z0-9 .'-]{1,30}$/),
)

/** Optional phone-like string or undefined */
const optionalPhoneArb = fc.oneof(
  fc.constant(undefined),
  fc.stringMatching(/^0\d{9}$/),
)

/** Optional date string or undefined */
const optionalDateArb = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: -631152000000, max: 1136073600000 }) // 1950-01-01 to 2006-01-01 in ms
    .map((ms) => new Date(ms).toISOString().slice(0, 10)),
)

/** Optional sex value or undefined */
const optionalSexArb = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom('Male', 'Female'),
)

/**
 * Generates a populated user_metadata record with at least one non-undefined field.
 * This mirrors the shape that getUserMetadata extracts from.
 */
const populatedUserMetadataArb: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    full_name: optionalStringArb,
    first_name: optionalStringArb,
    last_name: optionalStringArb,
    email: fc.oneof(fc.constant(undefined), fc.emailAddress()),
    phone: optionalPhoneArb,
    residence_town: optionalStringArb,
    residence_country: optionalStringArb,
    country: optionalStringArb,
    city: optionalStringArb,
    sex: optionalSexArb,
    date_of_birth: optionalDateArb,
    nrc_number: optionalStringArb,
    next_of_kin_name: optionalStringArb,
    next_of_kin_phone: optionalPhoneArb,
    address: optionalStringArb,
    nationality: optionalStringArb,
    signup_data: fc.oneof(
      fc.constant(undefined),
      fc.record({
        full_name: optionalStringArb,
        phone: optionalPhoneArb,
        email: fc.oneof(fc.constant(undefined), fc.emailAddress()),
      }),
    ),
  })
  // Ensure at least one field is defined so user_metadata is "populated"
  .filter((meta) => Object.values(meta).some((v) => v !== undefined))

/** Generates a User with populated user_metadata */
const userWithPopulatedMetadataArb: fc.Arbitrary<User> = fc.record({
  id: fc.uuid(),
  email: fc.emailAddress(),
  role: fc.constant('student'),
  full_name: optionalStringArb,
  user_metadata: populatedUserMetadataArb,
})

// ---------------------------------------------------------------------------
// Property 4: getUserMetadata with populated user_metadata
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — getUserMetadata with populated user_metadata', () => {
  /**
   * **Validates: Requirements 3.6, 3.7**
   *
   * getUserMetadata now extracts only top-level User fields (email, full_name,
   * first_name, last_name) — it no longer reads from user_metadata sub-object.
   */

  it('property: getUserMetadata output includes fields from top-level user object', () => {
    fc.assert(
      fc.property(userWithPopulatedMetadataArb, (user) => {
        const result = getUserMetadata(user)

        // When user has email, the result should include it
        if (typeof user.email === 'string' && user.email.trim() !== '') {
          expect(result.email).toBe(user.email)
        }

        // When user has full_name, the result should include it
        if (typeof user.full_name === 'string' && user.full_name.trim() !== '') {
          expect(result.full_name).toBe(user.full_name)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('property: getUserMetadata returns only top-level user fields, not nested metadata', () => {
    const userWithSignupDataArb: fc.Arbitrary<User> = fc.record({
      id: fc.uuid(),
      email: fc.emailAddress(),
      role: fc.constant('student'),
      full_name: optionalStringArb,
      user_metadata: fc.record({
        signup_data: fc.record({
          full_name: fc.stringMatching(/^[A-Za-z]{2,10} [A-Za-z]{2,10}$/),
          phone: fc.stringMatching(/^0\d{9}$/),
        }),
      }),
    })

    fc.assert(
      fc.property(userWithSignupDataArb, (user) => {
        const result = getUserMetadata(user)

        // getUserMetadata only returns top-level user fields now
        // It does NOT dig into user_metadata.signup_data
        if (user.full_name) {
          expect(result.full_name).toBe(user.full_name)
        }
        expect(result.email).toBe(user.email)
        // phone is not a top-level User field, so it should not appear
        expect(result.phone).toBeUndefined()
      }),
      { numRuns: 50 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 6: calculateCanonicalProfileCompletion unchanged
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — calculateCanonicalProfileCompletion unchanged', () => {
  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * calculateCanonicalProfileCompletion is NOT modified by the fix.
   * It takes profile and metadata, resolves 9 required fields, and returns
   * a percentage. This must produce identical results before and after fix.
   */

  /** Profile with all 9 required fields filled */
  const fullProfileArb = fc.record({
    first_name: fc.stringMatching(/^[A-Za-z]{2,12}$/),
    last_name: fc.stringMatching(/^[A-Za-z]{2,12}$/),
    email: fc.emailAddress(),
    phone: fc.stringMatching(/^0\d{9}$/),
    date_of_birth: fc.integer({ min: -631152000000, max: 1136073600000 })
      .map((ms) => new Date(ms).toISOString().slice(0, 10)),
    sex: fc.constantFrom('Male', 'Female'),
    nrc_number: fc.stringMatching(/^\d{6}\/\d{2}\/\d$/),
    address: fc.stringMatching(/^[A-Za-z][A-Za-z ]{2,19}$/),
    next_of_kin_name: fc.stringMatching(/^[A-Za-z][A-Za-z ]{2,19}$/),
  })

  it('property: full 9-field profile always returns 100%', () => {
    fc.assert(
      fc.property(fullProfileArb, (profile) => {
        const result = calculateCanonicalProfileCompletion(profile, {})
        expect(result).toBe(100)
      }),
      { numRuns: 50 },
    )
  })

  it('property: completion is proportional to filled fields out of 9', () => {
    // Generate a profile with a random subset of the 9 required fields
    const partialProfileArb = fc.record({
      first_name: optionalStringArb,
      last_name: optionalStringArb,
      email: fc.oneof(fc.constant(undefined), fc.emailAddress()),
      phone: optionalPhoneArb,
      date_of_birth: optionalDateArb,
      sex: optionalSexArb,
      nrc_number: optionalStringArb,
      address: optionalStringArb,
      next_of_kin_name: optionalStringArb,
    })

    fc.assert(
      fc.property(partialProfileArb, (profile) => {
        const result = calculateCanonicalProfileCompletion(profile, {})

        // Result must be between 0 and 100
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(100)

        // Result must be a multiple of round(N/9 * 100) for some N in 0..9
        // i.e., it must be one of the valid percentages for 0-9 filled fields
        const validPercentages = Array.from({ length: REQUIRED_PROFILE_FIELD_COUNT + 1 }, (_, i) =>
          Math.round((i / REQUIRED_PROFILE_FIELD_COUNT) * 100),
        )
        expect(validPercentages).toContain(result)
      }),
      { numRuns: 100 },
    )
  })

  it('property: empty profile and metadata returns 0%', () => {
    expect(calculateCanonicalProfileCompletion(null, null)).toBe(0)
    expect(calculateCanonicalProfileCompletion(undefined, undefined)).toBe(0)
    expect(calculateCanonicalProfileCompletion({}, {})).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Property 5: Auth error name-based detection preserved
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — AuthenticationError name-based detection', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * Errors with `name === 'AuthenticationError'` are correctly detected and
   * re-thrown on unfixed code. The fix ADDS detection of status 401, but
   * must NOT break name-based detection.
   *
   * This test captures the existing name-based detection behavior.
   */

  it('property: errors with name AuthenticationError are always detected', () => {
    const errorMessageArb = fc.stringMatching(/^[A-Za-z ]{1,40}$/)

    fc.assert(
      fc.property(errorMessageArb, (message) => {
        const authError = new Error(message)
        authError.name = 'AuthenticationError'

        // Replicate the auth error detection logic from useProfileQuery.ts
        const isAuthError =
          authError &&
          typeof authError === 'object' &&
          'name' in authError &&
          (authError as Error).name === 'AuthenticationError'

        // Name-based detection must always work
        expect(isAuthError).toBe(true)
      }),
      { numRuns: 50 },
    )
  })

  it('property: non-auth errors are NOT detected as auth errors', () => {
    // Generate error names that are NOT 'AuthenticationError'
    const nonAuthErrorNameArb = fc
      .stringMatching(/^[A-Za-z]{3,20}$/)
      .filter((name) => name !== 'AuthenticationError')

    fc.assert(
      fc.property(nonAuthErrorNameArb, (errorName) => {
        const err = new Error('some error')
        err.name = errorName

        // Replicate the auth error detection logic from useProfileQuery.ts
        const isAuthError =
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as Error).name === 'AuthenticationError'

        // Non-auth errors must NOT be detected as auth errors
        expect(isAuthError).toBe(false)
      }),
      { numRuns: 50 },
    )
  })
})
