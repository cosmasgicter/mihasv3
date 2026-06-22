/**
 * Property-based tests for Gate 8 (Contract_Sync_Gate) pure comparator.
 *
 * Spec: `.kiro/specs/beanola-launch-verification/` — tasks 10.2, 10.3, 10.4.
 * Module under test: `apps/admissions/tests/contract/contractComparator.ts`.
 *
 * Three properties live here (one test file, shared generators):
 *   - Property 12: the contract comparator reports divergence iff a frontend
 *                  shape differs from its serializer (Requirements 8.2, 8.5).
 *   - Property 13: error-code mapping coverage holds iff every backend code is
 *                  mapped on the frontend (Requirements 8.4, 8.6).
 *   - Property 14: tenant-admin tab coverage holds iff every listed tab has at
 *                  least one checked endpoint (Requirement 8.3).
 *
 * fast-check, ≥100 runs per property.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  compareShapes,
  errorCodeMappingCovered,
  tabCoverageHolds,
  TENANT_ADMIN_TABS,
  FIELD_TYPES,
  type FieldSpec,
  type FieldType,
  type Shape,
  type ShapeFields,
  type TenantAdminTabId,
} from '../contract/contractComparator'

const NUM_RUNS = 100

// ---------------------------------------------------------------------------
// Property 12 — shape-divergence detection (R8.2, R8.5)
// ---------------------------------------------------------------------------

/** Small field-name pool so independently generated shapes collide sometimes. */
const fieldNameArb = fc.constantFrom(
  'id',
  'name',
  'slug',
  'status',
  'createdAt',
  'count',
  'isActive',
  'metadata',
)

const fieldTypeArb: fc.Arbitrary<FieldType> = fc.constantFrom(...FIELD_TYPES)

/** A single field contract: type plus optional/nullable markers. */
const fieldSpecArb: fc.Arbitrary<FieldSpec> = fc.record({
  type: fieldTypeArb,
  optional: fc.boolean(),
  nullable: fc.boolean(),
})

/** A map of field name → field contract (small, to encourage collisions). */
const shapeFieldsArb: fc.Arbitrary<ShapeFields> = fc.dictionary(
  fieldNameArb,
  fieldSpecArb,
  { maxKeys: 5 },
)

/** A request/response shape: envelope + list framing + field contracts. */
const shapeArb: fc.Arbitrary<Shape> = fc.record({
  envelope: fc.boolean(),
  isList: fc.boolean(),
  fields: shapeFieldsArb,
})

/**
 * Independent reference notion of "field-for-field identical", mirroring the
 * comparator's contract: same envelope flag, same list flag, same field key
 * set, and identical type / Boolean(optional) / Boolean(nullable) for every
 * shared field. This is computed without calling `compareShapes`, so the test
 * is an independent oracle for the iff guarantee.
 */
function shapesAreIdentical(a: Shape, b: Shape): boolean {
  if (a.envelope !== b.envelope) return false
  if (a.isList !== b.isList) return false

  const aKeys = Object.keys(a.fields).sort()
  const bKeys = Object.keys(b.fields).sort()
  if (aKeys.length !== bKeys.length) return false
  if (aKeys.some((key, i) => key !== bKeys[i])) return false

  for (const key of aKeys) {
    const fa = a.fields[key]
    const fb = b.fields[key]
    if (fa.type !== fb.type) return false
    if (Boolean(fa.optional) !== Boolean(fb.optional)) return false
    if (Boolean(fa.nullable) !== Boolean(fb.nullable)) return false
  }
  return true
}

/** Deep structural clone of a shape (guaranteed field-for-field identical). */
function cloneShape(shape: Shape): Shape {
  const fields: ShapeFields = {}
  for (const [name, spec] of Object.entries(shape.fields)) {
    fields[name] = { ...spec }
  }
  return { envelope: shape.envelope, isList: shape.isList, fields }
}

/**
 * A pair of shapes that is either a guaranteed-identical clone or two
 * independent shapes. The clone branch exercises the "empty divergences" side
 * of the biconditional densely; the independent branch exercises the divergence
 * side (and occasional accidental matches from the small field-name pool).
 */
const shapePairArb: fc.Arbitrary<[Shape, Shape]> = fc.oneof(
  shapeArb.map((shape): [Shape, Shape] => [shape, cloneShape(shape)]),
  fc.tuple(shapeArb, shapeArb),
)

const endpointArb = fc.constantFrom(
  '/api/v1/admin/institutions/',
  '/api/v1/admin/domains/',
  '/api/v1/admin/offerings/',
  '/api/v1/admin/audit/',
)

describe('Contract_Sync_Gate — shape-divergence detection (Property 12)', () => {
  // Feature: beanola-launch-verification, Property 12: The contract comparator
  // reports divergence iff a frontend shape differs from its serializer.
  // Validates: Requirements 8.2, 8.5
  it('returns empty divergences iff the two shapes are field-for-field identical', () => {
    fc.assert(
      fc.property(shapePairArb, endpointArb, ([frontendShape, serializerShape], endpoint) => {
        const divergences = compareShapes(frontendShape, serializerShape, endpoint)
        const identical = shapesAreIdentical(frontendShape, serializerShape)

        // Biconditional: zero divergences exactly when shapes are identical.
        expect(divergences.length === 0).toBe(identical)

        // Every divergence records the field name and the endpoint path (R8.5).
        for (const d of divergences) {
          expect(d.endpoint).toBe(endpoint)
          expect(typeof d.field).toBe('string')
          expect(d.field.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 13 — error-code mapping coverage (R8.4, R8.6)
// ---------------------------------------------------------------------------

/** Pool of backend error codes shared by both sides so subset relations vary. */
const errorCodeArb = fc.constantFrom(
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'PERMISSION_DENIED',
  'CONFLICT',
  'RATE_LIMITED',
  'TOKEN_EXPIRED',
  'INVALID_FORMAT',
)

const codeSetArb = fc.array(errorCodeArb, { maxLength: 7 })

describe('Contract_Sync_Gate — error-code mapping coverage (Property 13)', () => {
  // Feature: beanola-launch-verification, Property 13: Error-code mapping
  // coverage holds iff every backend code is mapped on the frontend.
  // Validates: Requirements 8.4, 8.6
  it('covered iff backend codes are a subset of frontend-mapped codes', () => {
    fc.assert(
      fc.property(codeSetArb, codeSetArb, endpointArb, (backendCodes, frontendMapped, endpoint) => {
        const result = errorCodeMappingCovered(backendCodes, frontendMapped, endpoint)

        const mapped = new Set(frontendMapped)
        const expectedSubset = backendCodes.every((code) => mapped.has(code))

        // Biconditional: covered exactly when backend ⊆ mapped.
        expect(result.covered).toBe(expectedSubset)
        expect(result.endpoint).toBe(endpoint)

        // `unmapped` is exactly the sorted, de-duplicated set of backend codes
        // not present on the frontend (recorded for the evidence row, R8.6).
        const expectedUnmapped = [...new Set(backendCodes)]
          .filter((code) => !mapped.has(code))
          .sort()
        expect(result.unmapped).toEqual(expectedUnmapped)
        expect(result.covered).toBe(result.unmapped.length === 0)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 14 — tenant-admin tab coverage (R8.3)
// ---------------------------------------------------------------------------

/**
 * For each canonical tab, generate an endpoint count (0–3) and whether a
 * zero-count tab is omitted entirely or present as an empty list. Both encode
 * "uncovered", so the generator exercises the absent and empty-list branches.
 */
const tabCountsArb = fc.tuple(
  ...TENANT_ADMIN_TABS.map(() =>
    fc.record({
      count: fc.integer({ min: 0, max: 3 }),
      omitWhenEmpty: fc.boolean(),
    }),
  ),
)

describe('Contract_Sync_Gate — tenant-admin tab coverage (Property 14)', () => {
  // Feature: beanola-launch-verification, Property 14: Tenant-admin tab
  // coverage holds iff every listed tab has at least one checked endpoint.
  // Validates: Requirement 8.3
  it('holds iff every listed tab has ≥1 checked endpoint', () => {
    fc.assert(
      fc.property(tabCountsArb, (perTab) => {
        const checkedEndpointsByTab: Partial<Record<TenantAdminTabId, string[]>> = {}

        TENANT_ADMIN_TABS.forEach((tab, i) => {
          const { count, omitWhenEmpty } = perTab[i]
          if (count > 0) {
            checkedEndpointsByTab[tab] = Array.from(
              { length: count },
              (_, j) => `/api/v1/admin/${tab}/${j}/`,
            )
          } else if (!omitWhenEmpty) {
            // Present but empty — still uncovered.
            checkedEndpointsByTab[tab] = []
          }
          // else: omitted entirely — also uncovered.
        })

        const result = tabCoverageHolds(TENANT_ADMIN_TABS, checkedEndpointsByTab)

        const expectedUncovered = TENANT_ADMIN_TABS.filter((_, i) => perTab[i].count === 0)

        // Biconditional: holds exactly when no tab has zero endpoints.
        expect(result.holds).toBe(expectedUncovered.length === 0)
        // Uncovered tabs are reported in canonical order.
        expect(result.uncoveredTabs).toEqual(expectedUncovered)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
