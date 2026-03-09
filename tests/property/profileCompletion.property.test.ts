/**
 * Property 10: Profile completion calculation
 *
 * Feature: production-remediation
 *
 * For any profile object with a random subset of the 9 required fields
 * (first_name, last_name, email, phone, date_of_birth, gender, nrc_number,
 * address, next_of_kin) filled with non-empty values, the completion percentage
 * must equal (filledCount / 9) * 100, and the missing fields list must be
 * exactly the complement of the filled fields. The completion percentage must
 * be monotonically non-decreasing as fields are added.
 *
 * **Validates: Requirements 18.1, 18.2, 18.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateCanonicalProfileCompletion,
  getMissingProfileFields,
  REQUIRED_PROFILE_FIELDS,
  REQUIRED_PROFILE_FIELD_COUNT,
  type CanonicalProfileFields,
} from '../../src/lib/profileFieldMapping';

/**
 * The 9 required field keys as used in the completion calculation.
 * These map to DB columns with special handling:
 *   gender → sex, next_of_kin → next_of_kin_name, address can fallback to residence_town/city
 */
const REQUIRED_KEYS = REQUIRED_PROFILE_FIELDS.map(f => f.key);

/** Maps a logical required-field key to the actual CanonicalProfileFields property */
function buildProfileFromFilledKeys(
  filledKeys: Set<string>,
  valueGen: (key: string) => string,
): CanonicalProfileFields {
  const profile: CanonicalProfileFields = {};

  for (const key of filledKeys) {
    const val = valueGen(key);
    switch (key) {
      case 'first_name':
        profile.first_name = val;
        break;
      case 'last_name':
        profile.last_name = val;
        break;
      case 'email':
        profile.email = val;
        break;
      case 'phone':
        profile.phone = val;
        break;
      case 'date_of_birth':
        profile.date_of_birth = '1995-06-15';
        break;
      case 'gender':
        profile.sex = val; // stored as "sex" in DB
        break;
      case 'nrc_number':
        profile.nrc_number = val;
        break;
      case 'address':
        profile.address = val;
        break;
      case 'next_of_kin':
        profile.next_of_kin_name = val; // stored as "next_of_kin_name" in DB
        break;
    }
  }

  return profile;
}

/** Arbitrary: a non-empty trimmed string that is not "Not provided" */
const nonEmptyFieldValue = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter(s => s.trim().length > 0 && s.trim() !== 'Not provided');

/** Arbitrary: a random subset of the 9 required field keys */
const fieldSubsetArb = fc.subarray(REQUIRED_KEYS, { minLength: 0, maxLength: 9 });

describe('Profile Completion Calculation Property Tests (Property 10)', () => {
  describe('P10.1: Completion percentage equals (filledCount / 9) * 100', () => {
    it('percentage matches the ratio of filled fields to total required fields', () => {
      fc.assert(
        fc.property(fieldSubsetArb, nonEmptyFieldValue, (filledKeys, value) => {
          const filledSet = new Set(filledKeys);
          const profile = buildProfileFromFilledKeys(filledSet, () => value);

          const percentage = calculateCanonicalProfileCompletion(profile);
          const expected = Math.round((filledSet.size / REQUIRED_PROFILE_FIELD_COUNT) * 100);

          expect(percentage).toBe(expected);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P10.2: Missing fields list is the complement of filled fields', () => {
    it('missing fields are exactly those not in the filled subset', () => {
      fc.assert(
        fc.property(fieldSubsetArb, nonEmptyFieldValue, (filledKeys, value) => {
          const filledSet = new Set(filledKeys);
          const profile = buildProfileFromFilledKeys(filledSet, () => value);

          const missing = getMissingProfileFields(profile);
          const missingKeys = new Set(missing.map(m => m.key));
          const expectedMissing = new Set(REQUIRED_KEYS.filter(k => !filledSet.has(k)));

          expect(missingKeys).toEqual(expectedMissing);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P10.3: Filled + missing fields always equal all 9 required fields', () => {
    it('the union of filled and missing fields covers all required fields', () => {
      fc.assert(
        fc.property(fieldSubsetArb, nonEmptyFieldValue, (filledKeys, value) => {
          const filledSet = new Set(filledKeys);
          const profile = buildProfileFromFilledKeys(filledSet, () => value);

          const missing = getMissingProfileFields(profile);
          const totalAccountedFor = filledSet.size + missing.length;

          expect(totalAccountedFor).toBe(REQUIRED_PROFILE_FIELD_COUNT);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P10.4: Completion is monotonically non-decreasing as fields are added', () => {
    it('adding a field never decreases the completion percentage', () => {
      fc.assert(
        fc.property(
          fc.shuffledSubarray(REQUIRED_KEYS, { minLength: 0, maxLength: 9 }),
          nonEmptyFieldValue,
          (orderedKeys, value) => {
            let prevPercentage = 0;
            const filledSoFar = new Set<string>();

            for (const key of orderedKeys) {
              filledSoFar.add(key);
              const profile = buildProfileFromFilledKeys(filledSoFar, () => value);
              const percentage = calculateCanonicalProfileCompletion(profile);

              expect(percentage).toBeGreaterThanOrEqual(prevPercentage);
              prevPercentage = percentage;
            }
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('P10.5: Empty profile yields 0%, full profile yields 100%', () => {
    it('no fields filled gives 0% and all fields filled gives 100%', () => {
      fc.assert(
        fc.property(nonEmptyFieldValue, (value) => {
          // Empty profile
          const emptyProfile: CanonicalProfileFields = {};
          expect(calculateCanonicalProfileCompletion(emptyProfile)).toBe(0);
          expect(getMissingProfileFields(emptyProfile)).toHaveLength(REQUIRED_PROFILE_FIELD_COUNT);

          // Full profile
          const fullProfile = buildProfileFromFilledKeys(new Set(REQUIRED_KEYS), () => value);
          expect(calculateCanonicalProfileCompletion(fullProfile)).toBe(100);
          expect(getMissingProfileFields(fullProfile)).toHaveLength(0);
        }),
        { numRuns: 10 },
      );
    });
  });
});
