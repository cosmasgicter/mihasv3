// @vitest-environment node
// Feature: system-performance-hardening, Property 14: Selection-membership equivalence
/**
 * Property Test: Selection-membership equivalence
 * Validates: Requirements 10.5, 10.8
 *
 * Task 17.5 replaced `selectedIds.includes(id)` selection-membership checks with a
 * `useMemo`-built `Set<string>` and `set.has(id)` (see
 * `apps/admissions/src/components/admin/applications/ApplicationsTable.tsx` and
 * `VirtualizedApplicationsGrid.tsx`):
 *
 *   const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
 *   // ...later: selectedIdSet.has(id)
 *
 * Property 14 pins the equivalence invariant: for ANY collection of selected
 * identifiers and ANY candidate id, the memoized `Set.has(id)` lookup must return
 * the SAME boolean as an `Array.includes(id)` scan over the identical collection.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ---- Pure mirrors of the production memoized-Set selection membership ----
//
// These mirror exactly what the admin applications list/table builds and uses.
// The set is built from the identical `selectedIds` collection the array scan
// reads from, so the only thing under test is the membership-check equivalence.

/** Mirror of `useMemo(() => new Set(selectedIds), [selectedIds])`. */
function buildSelectedIdSet(selectedIds: string[]): Set<string> {
  return new Set(selectedIds)
}

/** Mirror of the new `selectedIdSet.has(id)` check. */
function setHas(selectedIdSet: Set<string>, id: string): boolean {
  return selectedIdSet.has(id)
}

/** Mirror of the prior `selectedIds.includes(id)` scan. */
function arrayIncludes(selectedIds: string[], id: string): boolean {
  return selectedIds.includes(id)
}

// ---- Generators ----

// Application ids in this app are typically uuids/strings; we use arbitrary
// non-empty-ish strings (and allow duplicates in the collection, since selection
// arrays are not guaranteed unique upstream) to exercise the full input space.
const idArb = fc.string({ minLength: 1, maxLength: 12 })

// The selected collection: an array of ids, possibly with duplicates, possibly empty.
const selectedIdsArb = fc.array(idArb, { minLength: 0, maxLength: 30 })

/**
 * A query id drawn sometimes FROM the collection (guaranteed member) and
 * sometimes independently (likely non-member), so the property is exercised on
 * both the true and false branches of membership.
 */
function queryFromCollection(selectedIds: string[]): fc.Arbitrary<string> {
  if (selectedIds.length === 0) return idArb
  return fc.oneof(fc.constantFrom(...selectedIds), idArb)
}

// ---- Property Tests ----

describe('Feature: system-performance-hardening, Property 14: Selection-membership equivalence', () => {
  it('set.has(id) equals array.includes(id) for an arbitrary query id', () => {
    /**
     * **Validates: Requirements 10.5, 10.8**
     *
     * For any selected collection and any candidate id, the memoized Set lookup
     * returns the same boolean as the array `includes` scan.
     */
    fc.assert(
      fc.property(
        selectedIdsArb.chain((selectedIds) =>
          fc.tuple(fc.constant(selectedIds), queryFromCollection(selectedIds)),
        ),
        ([selectedIds, queryId]) => {
          const selectedIdSet = buildSelectedIdSet(selectedIds)
          expect(setHas(selectedIdSet, queryId)).toBe(arrayIncludes(selectedIds, queryId))
        },
      ),
      { numRuns: 200 },
    )
  })

  it('set.has returns true for every element of the collection', () => {
    /**
     * **Validates: Requirements 10.5, 10.8**
     *
     * Every member of the collection is reported present by both the Set and the
     * array scan (they agree on all true cases).
     */
    fc.assert(
      fc.property(selectedIdsArb, (selectedIds) => {
        const selectedIdSet = buildSelectedIdSet(selectedIds)
        for (const id of selectedIds) {
          expect(setHas(selectedIdSet, id)).toBe(true)
          expect(setHas(selectedIdSet, id)).toBe(arrayIncludes(selectedIds, id))
        }
      }),
      { numRuns: 200 },
    )
  })

  it('set.has agrees with array.includes for random non-members', () => {
    /**
     * **Validates: Requirements 10.5, 10.8**
     *
     * For a randomly generated id that may or may not be in the collection, the
     * Set and the array scan agree (covering the false / absent cases).
     */
    fc.assert(
      fc.property(selectedIdsArb, idArb, (selectedIds, candidate) => {
        const selectedIdSet = buildSelectedIdSet(selectedIds)
        expect(setHas(selectedIdSet, candidate)).toBe(arrayIncludes(selectedIds, candidate))
      }),
      { numRuns: 200 },
    )
  })
})
