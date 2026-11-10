/**
 * Property tests for platform-simplification-and-polish (Spec B).
 *
 * Property 11 (task 22.7): rendered size rules classify correctly.
 * Property 6 (task 23.5) is appended by that task.
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  FONT_FLOORS,
  HIT_AREA_MIN,
  classifyActionWidth,
  classifyClippedText,
  classifyFirstControl,
  classifyFontSize,
  classifyHitArea,
  classifyOverflow,
  type ClippedRecord,
  type HitRecord,
  type OverflowRecord,
  type Presence,
  type TextRecord,
  type TextRole,
} from '../../../../scripts/rendered-gate-rules';

const roles: TextRole[] = ['caption', 'navigation', 'control', 'body', 'other'];
const present: Presence = { rendered: true, visibilityHidden: false, area: 400, inClosedDetails: false, ariaHidden: false };
const notMeasured = fc.constantFrom<Partial<Presence>>(
  { rendered: false },
  { visibilityHidden: true },
  { area: 0 },
  { inClosedDetails: true },
);

describe('Property 11: rendered size rules classify correctly', () => {
  it('font size: a measurable record is a finding exactly when it is under its role floor', () => {
    fc.assert(
      fc.property(fc.constantFrom(...roles), fc.double({ min: 6, max: 30, noNaN: true }), fc.boolean(), fc.boolean(), (role, size, ariaHidden, student) => {
        const rec: TextRecord = { ...present, ariaHidden, kind: 'text', selector: 's', role, fontSize: size };
        const out = classifyFontSize([rec], { studentRoute: student });
        // aria-hidden never excuses a font size (the navigation labels are aria-hidden).
        const expected = student && size + 0.1 < FONT_FLOORS[role];
        expect(out.length > 0).toBe(expected);
      }),
    );
  });
  it('font size: records that are not measurable and non-student routes give nothing', () => {
    fc.assert(
      fc.property(fc.constantFrom(...roles), fc.double({ min: 1, max: 11, noNaN: true }), notMeasured, (role, size, off) => {
        const rec: TextRecord = { ...present, ...off, kind: 'text', selector: 's', role, fontSize: size };
        expect(classifyFontSize([rec], { studentRoute: true })).toHaveLength(0);
      }),
    );
  });
  it('hit area: under 44 in either dimension is a finding; aria-hidden and unmeasurable are skipped; inline flag carried', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 80, noNaN: true }), fc.double({ min: 1, max: 80, noNaN: true }),
        fc.boolean(), fc.boolean(), fc.option(notMeasured, { nil: undefined }),
        (w, h, ariaHidden, inline, off) => {
          const rec: HitRecord = { ...present, ...(off ?? {}), ariaHidden, selector: 'a', width: w, height: h, inRunningText: inline };
          const out = classifyHitArea([rec]);
          const small = w + 0.1 < HIT_AREA_MIN || h + 0.1 < HIT_AREA_MIN;
          const measured = !off && !ariaHidden;
          expect(out.length > 0).toBe(measured && small);
          if (out.length > 0) expect(Boolean(out[0]!.inRunningText)).toBe(inline);
        },
      ),
    );
  });
  it('overflow: only past the right edge, excused by a scroll container that ends inside the viewport', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 1000 }), fc.integer({ min: 100, max: 1300 }),
        fc.option(fc.integer({ min: 100, max: 1300 }), { nil: null }), fc.option(notMeasured, { nil: undefined }),
        (vw, right, container, off) => {
          const rec: OverflowRecord = { ...present, ...(off ?? {}), selector: 'x', right, scrollContainerRight: container };
          const out = classifyOverflow([rec], vw);
          const excused = container !== null && container <= vw + 0.1;
          expect(out.length > 0).toBe(!off && right > vw + 0.1 && !excused);
        },
      ),
    );
  });
  it('clipped text: every overflow-x value; auto and scroll never report; spill over 1 px reports otherwise', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('visible', 'hidden', 'clip', 'auto', 'scroll'), fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 300 }),
        fc.boolean(), fc.boolean(),
        (ox, sw, cw, direct, nav) => {
          const rec: ClippedRecord = { ...present, selector: 'x', overflowX: ox, scrollWidth: sw, clientWidth: cw, inNav: nav, hasDirectText: direct };
          const out = classifyClippedText([rec]);
          const expected = direct && ox !== 'auto' && ox !== 'scroll' && sw - cw > 1;
          expect(out.length > 0).toBe(expected);
          if (out.length > 0) expect(Boolean(out[0]!.inNav)).toBe(nav);
        },
      ),
    );
  });
  it('first control and landing action widths follow the stated boxes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 900 }), fc.integer({ min: 1, max: 200 }), fc.integer({ min: 0, max: 120 }), fc.integer({ min: 300, max: 900 }),
        (top, height, barBottom, limitTop) => {
          const out = classifyFirstControl({ selector: 's', top, bottom: top + height, barBottom, limitTop });
          expect(out.length === 0).toBe(top >= barBottom && top + height <= limitTop);
        },
      ),
    );
    fc.assert(
      fc.property(fc.double({ min: 50, max: 400, noNaN: true }), fc.double({ min: 50, max: 400, noNaN: true }), (a, b) => {
        const out = classifyActionWidth({ primarySelector: 'p', primaryWidth: a, secondaryWidth: b });
        expect(out.length === 0).toBe(Math.abs(a - b) <= 1);
      }),
    );
  });
});
