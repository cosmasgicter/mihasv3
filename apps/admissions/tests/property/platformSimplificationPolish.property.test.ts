/**
 * Property tests for platform-simplification-and-polish (Spec B).
 *
 * Property 11 (task 22.7): rendered size rules classify correctly.
 * Property 6 (task 23.5): every status tone is readable.
 * Property 7 (task 25.6): a wizard control's accessible name contains its visible text.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { WizardActionBar } from '../../src/pages/student/applicationWizard/components/WizardActionBar';
import { STATUS_TONES, type StatusTone } from '../../src/lib/statusTone';
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

// ---------------------------------------------------------------------------
// Property 6: every status tone is readable (task 23.5, Requirements 18.2, 18.4, 18.6)
// ---------------------------------------------------------------------------
const CSS = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'design-tokens.css'), 'utf8');
type Rgb = [number, number, number];

function token(name: string): Rgb {
  const m = new RegExp(`--color-${name}\\s*:\\s*#([0-9a-fA-F]{6})`).exec(CSS);
  if (!m) throw new Error(`token --color-${name} not found`);
  const h = m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => Math.round(fg[i]! * alpha + bg[i]! * (1 - alpha))) as Rgb;
}

/** Tint colour and alpha for each tone, read from the class the map returns (bg-<token>[/NN]). */
function tintOf(tone: StatusTone, surface: Rgb): Rgb {
  const m = /^bg-([a-z-]+?)(?:\/(\d+))?$/.exec(STATUS_TONES[tone].tint);
  if (!m) throw new Error(`unparsable tint ${STATUS_TONES[tone].tint}`);
  return over(token(m[1]!), m[2] ? Number(m[2]) / 100 : 1, surface);
}
function tokenOfClass(cls: string): Rgb {
  const m = /^text-([a-z-]+)$/.exec(cls);
  if (!m) throw new Error(`unparsable text class ${cls}`);
  return token(m[1]!);
}

describe('Property 6: every status tone is readable', () => {
  const tones = Object.keys(STATUS_TONES) as StatusTone[];
  const surfaces: Record<string, Rgb> = {
    white: token('background'),
    card: token('card'),
    muted: token('muted'),
  };

  it('every tone label is --color-foreground (--color-muted-foreground for muted)', () => {
    for (const tone of tones) {
      expect(STATUS_TONES[tone].text).toBe(tone === 'muted' ? 'text-muted-foreground' : 'text-foreground');
    }
  });

  it('label text clears 4.5:1 and the icon clears 3:1 on every tint over every surface', () => {
    fc.assert(
      fc.property(fc.constantFrom(...tones), fc.constantFrom(...Object.keys(surfaces)), (tone, surfaceName) => {
        const tint = tintOf(tone, surfaces[surfaceName]!);
        const label = tokenOfClass(STATUS_TONES[tone].text);
        expect(ratio(label, tint), `${tone} label on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
        // Both icon options: the tone's own icon class, and the inherited label colour.
        const icon = tokenOfClass(STATUS_TONES[tone].icon);
        expect(ratio(icon, tint), `${tone} icon on ${surfaceName}`).toBeGreaterThanOrEqual(3);
        expect(ratio(label, tint), `${tone} inherited icon on ${surfaceName}`).toBeGreaterThanOrEqual(3);
      }),
    );
  });

  it('the accent tone icon is text-accent-foreground, not the 1.2:1 text-accent', () => {
    expect(STATUS_TONES.accent.icon).toBe('text-accent-foreground');
    expect(ratio(token('accent'), token('background'))).toBeLessThan(3);
  });
});

describe('Property 7: accessible name contains visible text', () => {
  afterEach(cleanup);
  const stepTitle = fc.stringMatching(/^[A-Z][a-z]{2,12}( [a-z]{2,10}){0,2}$/);
  const label = fc.stringMatching(/^[A-Z][a-z]{2,12}( [a-z]{2,10}){0,2}$/);
  it('the previous and next controls are named by their visible text, whatever the destination', () => {
    fc.assert(
      fc.property(stepTitle, stepTitle, label, (previousStepTitle, nextStepTitle, nextLabel) => {
        render(
          React.createElement(WizardActionBar, {
            previousStepTitle,
            nextStepTitle,
            isLastStep: false,
            loading: false,
            nextDisabled: false,
            submitDisabled: false,
            nextLabel,
            onPrev: () => {},
            onNext: () => {},
            onSaveNow: () => {},
            saveStatus: 'saved',
            saveError: null,
            lastSavedAt: 0,
            isOnline: true,
            keyboardOpen: false,
          }),
        );
        for (const button of screen.getAllByRole('button')) {
          const visible = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
          const aria = button.getAttribute('aria-label');
          // No aria-label may replace visible text with different words.
          if (visible && aria) expect(aria.toLowerCase()).toContain(visible.toLowerCase());
        }
        // Exact-name lookups: the visible text is the name, the destination is not.
        expect(screen.getByRole('button', { name: nextLabel })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Previous' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: new RegExp(`continue to ${nextStepTitle}`, 'i') })).toBeNull();
        cleanup();
      }),
      { numRuns: 40 },
    );
  });
});
