/**
 * Property-based tests — launch-verification Mobile_UI_Gate detectors (Tasks 5.2 + 5.3).
 *
 * Spec: `beanola-launch-verification`. Exercises the pure DOM defect detectors in
 * `apps/admissions/tests/playwright/detectors.ts` over synthetic DOM fixtures.
 *
 * Two properties are enforced in this file:
 *
 *   Property 5 — Mobile-UI defect detectors are deterministic and fire exactly
 *   when their defect is present. **Validates: Requirements 4.3, 4.4, 4.5, 4.6,
 *   4.7, 4.8**
 *
 *   Property 6 — A route+viewport matrix passes overall iff every cell passes.
 *   **Validates: Requirements 4.10**
 *
 * Each property generates synthetic element/page shapes with a controllable
 * defect flag and asserts (a) determinism — the same input yields the same
 * result across repeated calls — and (b) the detector fires if and only if its
 * specific defect condition holds, computed by an independent oracle.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  detectBrokenDialogs,
  detectClippedButtonText,
  detectHorizontalOverflow,
  detectIconOnlyControlsWithoutName,
  detectOverlappingRegions,
  detectUndersizedTouchTargets,
  runDetectors,
  HORIZONTAL_OVERFLOW_TOLERANCE_PX,
  TOUCH_TARGET_MIN_PX,
  type Defect,
  type ElementShape,
  type PageShape,
  type Rect,
  type ViewportShape,
} from '../playwright/detectors';

const RUNS = 200;

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/** Finite integer dimension/coordinate within a generous synthetic range. */
const dimensionArb = fc.integer({ min: -2000, max: 4000 });

/** Optional finite integer (covers the "field absent" guard branches). */
const optionalDimensionArb = fc.option(dimensionArb, { nil: undefined });

/** Optional boolean (covers `true`, `false`, and undefined guard branches). */
const optionalBooleanArb = fc.option(fc.boolean(), { nil: undefined });

/**
 * Name-source string that may be empty, whitespace-only, or meaningful — so the
 * accessible-name predicate is exercised across its full input space.
 */
const nameSourceArb = fc.option(
  fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.string({ minLength: 1, maxLength: 12 }),
  ),
  { nil: undefined },
);

const rectArb: fc.Arbitrary<Rect> = fc.record({
  x: dimensionArb,
  y: dimensionArb,
  width: fc.integer({ min: 0, max: 4000 }),
  height: fc.integer({ min: 0, max: 4000 }),
});

const viewportArb: fc.Arbitrary<ViewportShape> = fc.record({
  width: fc.integer({ min: 1, max: 4000 }),
  height: fc.integer({ min: 1, max: 4000 }),
});

// ---------------------------------------------------------------------------
// Independent oracles (mirror each detector's documented predicate)
// ---------------------------------------------------------------------------

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasAccessibleName(el: ElementShape): boolean {
  return [el.accessibleName, el.ariaLabel, el.ariaLabelledbyText, el.textContent].some(
    (s) => typeof s === 'string' && s.trim().length > 0,
  );
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > 0 && overlapY > 0;
}

/** Count expected overlapping sibling-region pairs, mirroring the grouping rule. */
function expectedOverlapCount(regions: ElementShape[]): number {
  const groups = new Map<string, ElementShape[]>();
  for (const region of regions) {
    if (!region.rect) continue;
    const key =
      region.siblingGroup && region.siblingGroup.trim().length > 0
        ? region.siblingGroup.trim()
        : '__default__';
    const bucket = groups.get(key);
    if (bucket) bucket.push(region);
    else groups.set(key, [region]);
  }
  let count = 0;
  for (const bucket of groups.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i];
        const b = bucket[j];
        if (a?.rect && b?.rect && rectsOverlap(a.rect, b.rect)) count += 1;
      }
    }
  }
  return count;
}

function dialogIsBroken(d: ElementShape): boolean {
  const losesFocusContainment = d.hasFocusContainment !== true;
  const cannotBeDismissed = d.dismissibleByEscape !== true && d.hasCloseControl !== true;
  return losesFocusContainment || cannotBeDismissed;
}

// ===========================================================================
// Feature: beanola-launch-verification, Property 5: Mobile-UI defect detectors
// are deterministic and fire exactly when their defect is present.
// Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
// ===========================================================================

describe('Property 5: detectors are deterministic and fire iff their defect is present', () => {
  it('detectHorizontalOverflow fires iff bodyScrollWidth exceeds viewport width + tolerance (Req 4.3)', () => {
    fc.assert(
      fc.property(dimensionArb, viewportArb, (bodyScrollWidth, viewport) => {
        const first = detectHorizontalOverflow(bodyScrollWidth, viewport);
        const second = detectHorizontalOverflow(bodyScrollWidth, viewport);

        // (a) determinism
        expect(second).toEqual(first);

        // (b) fires iff defect condition holds
        const shouldFire =
          isFiniteNumber(bodyScrollWidth) &&
          isFiniteNumber(viewport.width) &&
          bodyScrollWidth > viewport.width + HORIZONTAL_OVERFLOW_TOLERANCE_PX;
        expect(first !== null).toBe(shouldFire);
        if (first) expect(first.kind).toBe('horizontal-overflow');
      }),
      { numRuns: RUNS },
    );
  });

  it('detectClippedButtonText fires iff text scrollWidth exceeds clientWidth (Req 4.4)', () => {
    const controlArb: fc.Arbitrary<ElementShape> = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      textScrollWidth: optionalDimensionArb,
      clientWidth: optionalDimensionArb,
    });

    fc.assert(
      fc.property(fc.array(controlArb, { maxLength: 12 }), (controls) => {
        const first = detectClippedButtonText(controls);
        const second = detectClippedButtonText(controls);
        expect(second).toEqual(first);

        const expected = controls.filter(
          (c) =>
            isFiniteNumber(c.textScrollWidth) &&
            isFiniteNumber(c.clientWidth) &&
            c.textScrollWidth > c.clientWidth,
        ).length;
        expect(first.length).toBe(expected);
        expect(first.length > 0).toBe(expected > 0);
        for (const d of first) expect(d.kind).toBe('clipped-button-text');
      }),
      { numRuns: RUNS },
    );
  });

  it('detectUndersizedTouchTargets fires iff an interactive target is below the minimum (Req 4.5)', () => {
    const controlArb: fc.Arbitrary<ElementShape> = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      isInteractive: optionalBooleanArb,
      rect: fc.option(rectArb, { nil: undefined }),
    });

    fc.assert(
      fc.property(fc.array(controlArb, { maxLength: 12 }), (controls) => {
        const first = detectUndersizedTouchTargets(controls);
        const second = detectUndersizedTouchTargets(controls);
        expect(second).toEqual(first);

        const expected = controls.filter((c) => {
          if (c.isInteractive !== true || !c.rect) return false;
          const { width, height } = c.rect;
          if (!isFiniteNumber(width) || !isFiniteNumber(height)) return false;
          return width < TOUCH_TARGET_MIN_PX || height < TOUCH_TARGET_MIN_PX;
        }).length;
        expect(first.length).toBe(expected);
        expect(first.length > 0).toBe(expected > 0);
        for (const d of first) expect(d.kind).toBe('undersized-touch-target');
      }),
      { numRuns: RUNS },
    );
  });

  it('detectIconOnlyControlsWithoutName fires iff an interactive control has no accessible name (Req 4.6)', () => {
    const controlArb: fc.Arbitrary<ElementShape> = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      isInteractive: optionalBooleanArb,
      accessibleName: nameSourceArb,
      ariaLabel: nameSourceArb,
      ariaLabelledbyText: nameSourceArb,
      textContent: nameSourceArb,
    });

    fc.assert(
      fc.property(fc.array(controlArb, { maxLength: 12 }), (controls) => {
        const first = detectIconOnlyControlsWithoutName(controls);
        const second = detectIconOnlyControlsWithoutName(controls);
        expect(second).toEqual(first);

        const expected = controls.filter(
          (c) => c.isInteractive === true && !hasAccessibleName(c),
        ).length;
        expect(first.length).toBe(expected);
        expect(first.length > 0).toBe(expected > 0);
        for (const d of first) expect(d.kind).toBe('icon-only-without-accessible-name');
      }),
      { numRuns: RUNS },
    );
  });

  it('detectOverlappingRegions fires iff two sibling regions in the same group intersect (Req 4.7)', () => {
    const regionArb: fc.Arbitrary<ElementShape> = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      rect: fc.option(rectArb, { nil: undefined }),
      siblingGroup: fc.option(fc.constantFrom('a', 'b', 'c'), { nil: undefined }),
    });

    fc.assert(
      fc.property(fc.array(regionArb, { maxLength: 10 }), (regions) => {
        const first = detectOverlappingRegions(regions);
        const second = detectOverlappingRegions(regions);
        expect(second).toEqual(first);

        const expected = expectedOverlapCount(regions);
        expect(first.length).toBe(expected);
        expect(first.length > 0).toBe(expected > 0);
        for (const d of first) {
          expect(d.kind).toBe('overlapping-regions');
          expect(d.offenders).toHaveLength(2);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('detectBrokenDialogs fires iff a dialog loses focus or cannot be dismissed (Req 4.8)', () => {
    const dialogArb: fc.Arbitrary<ElementShape> = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      role: fc.constant('dialog'),
      hasFocusContainment: optionalBooleanArb,
      dismissibleByEscape: optionalBooleanArb,
      hasCloseControl: optionalBooleanArb,
    });

    fc.assert(
      fc.property(fc.array(dialogArb, { maxLength: 10 }), (dialogs) => {
        const first = detectBrokenDialogs(dialogs);
        const second = detectBrokenDialogs(dialogs);
        expect(second).toEqual(first);

        const expected = dialogs.filter(dialogIsBroken).length;
        expect(first.length).toBe(expected);
        expect(first.length > 0).toBe(expected > 0);
        for (const d of first) expect(d.kind).toBe('broken-dialog');
      }),
      { numRuns: RUNS },
    );
  });
});

// ===========================================================================
// Feature: beanola-launch-verification, Property 6: A route+viewport matrix
// passes overall iff every cell passes.
// Validates: Requirements 4.10
// ===========================================================================

/** One route+viewport cell of the Mobile_UI_Gate matrix and its fired defects. */
interface MatrixCell {
  route: string;
  viewport: ViewportShape;
  defects: Defect[];
}

/**
 * Test-local matrix rollup helper (mirrors Requirement 4.10): the matrix passes
 * overall iff every cell is defect-free; a single defective cell at any viewport
 * fails the whole matrix.
 */
function rollupMatrix(cells: MatrixCell[]): { passed: boolean; failedCells: MatrixCell[] } {
  const failedCells = cells.filter((c) => c.defects.length > 0);
  return { passed: failedCells.length === 0, failedCells };
}

const FIVE_VIEWPORTS: readonly ViewportShape[] = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

/** A clean page snapshot that runDetectors must report zero defects for. */
function cleanPage(viewport: ViewportShape): PageShape {
  return {
    viewport,
    bodyScrollWidth: viewport.width, // within tolerance -> no overflow
    controls: [],
    regions: [],
    dialogs: [],
  };
}

/** A page snapshot guaranteed to fire at least one detector (horizontal overflow). */
function defectivePage(viewport: ViewportShape): PageShape {
  return {
    viewport,
    bodyScrollWidth: viewport.width + 100, // well past the 1px tolerance
    controls: [],
    regions: [],
    dialogs: [],
  };
}

describe('Property 6: route+viewport matrix passes overall iff every cell passes (Req 4.10)', () => {
  it('rollup verdict equals the conjunction of all cell verdicts, fed by runDetectors', () => {
    // Each generated cell carries a controllable defect flag; defects are
    // produced by the real detector pipeline so the rollup is exercised end to end.
    const cellSpecArb = fc.record({
      route: fc.constantFrom('/', '/auth/signup', '/student/dashboard', '/admin/tenants', '/admin/applications'),
      viewportIndex: fc.integer({ min: 0, max: FIVE_VIEWPORTS.length - 1 }),
      defective: fc.boolean(),
    });

    fc.assert(
      fc.property(fc.array(cellSpecArb, { minLength: 1, maxLength: 30 }), (specs) => {
        const cells: MatrixCell[] = specs.map((spec) => {
          const viewport = FIVE_VIEWPORTS[spec.viewportIndex]!;
          const page = spec.defective ? defectivePage(viewport) : cleanPage(viewport);
          return { route: spec.route, viewport, defects: runDetectors(page) };
        });

        const result = rollupMatrix(cells);

        // determinism — rolling up the same cells twice yields the same verdict
        expect(rollupMatrix(cells).passed).toBe(result.passed);

        // overall pass iff every cell is defect-free
        const everyCellClean = cells.every((c) => c.defects.length === 0);
        expect(result.passed).toBe(everyCellClean);

        // a controllable flag drives the verdict: passes iff no cell was marked defective
        const noDefectiveSpec = specs.every((s) => !s.defective);
        expect(result.passed).toBe(noDefectiveSpec);

        // failed cells are exactly the defective ones
        expect(result.failedCells.length).toBe(specs.filter((s) => s.defective).length);
      }),
      { numRuns: RUNS },
    );
  });

  it('an all-clean matrix passes and any single defective cell fails the matrix', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.option(fc.integer({ min: 0, max: 9 }), { nil: undefined }),
        (cellCount, defectiveAt) => {
          const cells: MatrixCell[] = [];
          for (let i = 0; i < cellCount; i += 1) {
            const viewport = FIVE_VIEWPORTS[i % FIVE_VIEWPORTS.length]!;
            const makeDefective = defectiveAt !== undefined && defectiveAt % cellCount === i;
            const page = makeDefective ? defectivePage(viewport) : cleanPage(viewport);
            cells.push({ route: `/r${i}`, viewport, defects: runDetectors(page) });
          }

          const injectedDefect = defectiveAt !== undefined;
          expect(rollupMatrix(cells).passed).toBe(!injectedDefect);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
