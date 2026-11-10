/**
 * Rendered design gate: the pure classifier (platform-simplification task 22.4,
 * design 12.7, Requirement 19.7).
 *
 * The in-page measurement script (`apps/admissions/tests/harness-e2e/rendered-gate/
 * measure.ts`) returns plain records. This module turns them into findings with the
 * rule ids `measure/font-size`, `measure/hit-area`, `measure/overflow`,
 * `measure/clipped-text`, `measure/first-control` and `measure/action-width`. It has no
 * DOM, no Playwright and no I/O, so Property 11 and the unit tests drive it directly.
 */

export type TextRole = 'caption' | 'navigation' | 'control' | 'body' | 'other';

/** Requirement 16.1's floors, in CSS px, by role. */
export const FONT_FLOORS: Record<TextRole, number> = {
  caption: 14,
  navigation: 12,
  control: 16,
  body: 16,
  other: 12,
};

/** Requirement 16.10 / 19.7: the hit-area floor in CSS px. */
export const HIT_AREA_MIN = 44;

/** Sub-pixel layout rounds 44 px to 43.98; nothing under this counts as 44. */
const EPSILON = 0.1;

/** Requirement 19.7: "more than 1 px" for clipped text, "at most 1 px" for action widths. */
const CLIP_SLACK = 1;

export interface Presence {
  /** `display` is not none and the element has a layout box. */
  rendered: boolean;
  visibilityHidden: boolean;
  /** Width times height of the border box. */
  area: number;
  /** Inside a closed `<details>` or a collapsed region. */
  inClosedDetails: boolean;
  ariaHidden: boolean;
}

export interface TextRecord extends Presence {
  kind: 'text' | 'control-value';
  selector: string;
  role: TextRole;
  fontSize: number;
  text?: string;
}

export interface HitRecord extends Presence {
  selector: string;
  /** Width and height of the union of the element's box and its label's box. */
  width: number;
  height: number;
  inRunningText: boolean;
  /** True for a skip link that was measured after the script focused it. */
  measuredFocused?: boolean;
}

export interface OverflowRecord extends Presence {
  selector: string;
  /** The border box's right edge. */
  right: number;
  /**
   * The right edge of the nearest ancestor with `overflow-x: auto` or `scroll`, or
   * null. An ancestor that clips with `hidden` or `clip` is NOT reported here.
   */
  scrollContainerRight: number | null;
}

export interface ClippedRecord extends Presence {
  selector: string;
  overflowX: string;
  scrollWidth: number;
  clientWidth: number;
  inNav: boolean;
  hasDirectText: boolean;
}

export interface FirstControlRecord {
  selector: string;
  top: number;
  bottom: number;
  /** Bottom edge of the app bar; 0 when none is fixed or sticky at the top. */
  barBottom: number;
  /** Top edge of the sticky action bar (the wizard) or the viewport height (the landing). */
  limitTop: number;
  left?: number;
  right?: number;
  viewportWidth?: number;
}

export interface ActionWidthRecord {
  primarySelector: string;
  primaryWidth: number;
  secondaryWidth: number;
}

export interface Measurements {
  text: TextRecord[];
  hit: HitRecord[];
  overflow: OverflowRecord[];
  clipped: ClippedRecord[];
  viewportWidth: number;
  /** Present on wizard step pages. */
  wizardFirstControl?: FirstControlRecord | null;
  /** Present on the landing page. */
  landingPrimary?: FirstControlRecord | null;
  landingActions?: ActionWidthRecord | null;
}

export interface Finding {
  rule: string;
  selector: string;
  detail: string;
  /** Hit-area findings on an inline link carry the D17 flag. */
  inRunningText?: boolean;
  /** Clipped-text findings inside a `nav` element (a hard guardrail, 19.9). */
  inNav?: boolean;
}

export interface ClassifyOptions {
  /** True when the page path starts with `/student` (the font-size rule's scope). */
  studentRoute: boolean;
}

/** An element that is not rendered, hidden by visibility, empty or in a closed region. */
export function isMeasurable(p: Presence): boolean {
  return p.rendered && !p.visibilityHidden && p.area > 0 && !p.inClosedDetails;
}

export function fontFloor(role: TextRole): number {
  return FONT_FLOORS[role];
}

export function classifyFontSize(records: TextRecord[], options: ClassifyOptions): Finding[] {
  if (!options.studentRoute) return [];
  const out: Finding[] = [];
  for (const r of records) {
    // aria-hidden only takes an element out of the hit-area rule: the navigation's
    // labels and badges are aria-hidden spans that this rule must still see.
    if (!isMeasurable(r)) continue;
    const floor = fontFloor(r.role);
    if (r.fontSize + EPSILON < floor) {
      out.push({
        rule: 'measure/font-size',
        selector: r.selector,
        detail: `${r.role} text is ${round(r.fontSize)} px, floor ${floor} px`,
      });
    }
  }
  return out;
}

export function classifyHitArea(records: HitRecord[]): Finding[] {
  const out: Finding[] = [];
  for (const r of records) {
    if (!isMeasurable(r) || r.ariaHidden) continue;
    if (r.width + EPSILON < HIT_AREA_MIN || r.height + EPSILON < HIT_AREA_MIN) {
      out.push({
        rule: 'measure/hit-area',
        selector: r.selector,
        detail: `hit area is ${round(r.width)} x ${round(r.height)} px, floor ${HIT_AREA_MIN} x ${HIT_AREA_MIN} px`,
        inRunningText: r.inRunningText || undefined,
      });
    }
  }
  return out;
}

export function classifyOverflow(records: OverflowRecord[], viewportWidth: number): Finding[] {
  const out: Finding[] = [];
  for (const r of records) {
    if (!isMeasurable(r)) continue;
    if (r.right <= viewportWidth + EPSILON) continue;
    // A horizontal scroll container that ends inside the viewport excuses it; one
    // that clips (`hidden`/`clip`) never reaches this record as a container.
    if (r.scrollContainerRight !== null && r.scrollContainerRight <= viewportWidth + EPSILON) continue;
    out.push({
      rule: 'measure/overflow',
      selector: r.selector,
      detail: `ends at ${round(r.right)} px, viewport is ${viewportWidth} px`,
    });
  }
  return out;
}

export function classifyClippedText(records: ClippedRecord[]): Finding[] {
  const out: Finding[] = [];
  for (const r of records) {
    if (!isMeasurable(r) || !r.hasDirectText) continue;
    if (r.overflowX === 'auto' || r.overflowX === 'scroll') continue;
    if (r.scrollWidth - r.clientWidth > CLIP_SLACK) {
      out.push({
        rule: 'measure/clipped-text',
        selector: r.selector,
        detail: `${r.inNav ? 'in nav, ' : ''}overflow-x ${r.overflowX}, scrollWidth ${round(r.scrollWidth)} over clientWidth ${round(r.clientWidth)}`,
        inNav: r.inNav || undefined,
      });
    }
  }
  return out;
}

export function classifyFirstControl(record: FirstControlRecord | null | undefined): Finding[] {
  if (!record) return [];
  const vertical = record.top + EPSILON >= record.barBottom && record.bottom <= record.limitTop + EPSILON;
  const horizontal =
    record.left === undefined ||
    record.right === undefined ||
    record.viewportWidth === undefined ||
    (record.left + EPSILON >= 0 && record.right <= record.viewportWidth + EPSILON);
  if (vertical && horizontal) return [];
  return [
    {
      rule: 'measure/first-control',
      selector: record.selector,
      detail: `box ${round(record.top)}-${round(record.bottom)} px is not between ${round(record.barBottom)} and ${round(record.limitTop)} px`,
    },
  ];
}

export function classifyActionWidth(record: ActionWidthRecord | null | undefined): Finding[] {
  if (!record) return [];
  if (Math.abs(record.primaryWidth - record.secondaryWidth) <= CLIP_SLACK) return [];
  return [
    {
      rule: 'measure/action-width',
      selector: record.primarySelector,
      detail: `hero actions are ${round(record.primaryWidth)} and ${round(record.secondaryWidth)} px wide`,
    },
  ];
}

export function classifyMeasurements(m: Measurements, options: ClassifyOptions): Finding[] {
  return [
    ...classifyFontSize(m.text, options),
    ...classifyHitArea(m.hit),
    ...classifyOverflow(m.overflow, m.viewportWidth),
    ...classifyClippedText(m.clipped),
    ...classifyFirstControl(m.wizardFirstControl),
    ...classifyFirstControl(m.landingPrimary),
    ...classifyActionWidth(m.landingActions),
  ];
}

function round(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// ---------------------------------------------------------------------------
// Baseline comparison (task 22.5, Requirement 19.4)
// ---------------------------------------------------------------------------

export interface BaselineEntry {
  rule: string;
  page: string;
  viewport: string;
  selector: string;
  reason: string;
  inRunningText?: boolean;
  inNav?: boolean;
}

export interface KeyedFinding {
  rule: string;
  page: string;
  viewport: string;
  selector: string;
  detail?: string;
  inRunningText?: boolean;
  inNav?: boolean;
}

export const RULE_PREFIXES = ['impeccable/', 'axe/', 'measure/'] as const;

export function findingKey(f: { rule: string; page: string; viewport: string; selector: string }): string {
  return [f.rule, f.page, f.viewport, f.selector].join('\u0001');
}

export interface Comparison {
  newFindings: KeyedFinding[];
  staleEntries: BaselineEntry[];
  missingReasons: BaselineEntry[];
  badPrefix: BaselineEntry[];
}

/** Identical keys collapse into one; the three failures of Requirement 19.4. */
export function compareWithBaseline(findings: KeyedFinding[], baseline: BaselineEntry[]): Comparison {
  const baselineKeys = new Set(baseline.map(findingKey));
  const seen = new Set<string>();
  const unique: KeyedFinding[] = [];
  for (const f of findings) {
    const k = findingKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(f);
  }
  return {
    newFindings: unique.filter((f) => !baselineKeys.has(findingKey(f))),
    staleEntries: baseline.filter((e) => !seen.has(findingKey(e))),
    missingReasons: baseline.filter((e) => !e.reason || !e.reason.trim()),
    badPrefix: baseline.filter((e) => !RULE_PREFIXES.some((p) => e.rule.startsWith(p))),
  };
}

/** Requirement 19.9: the rules that may not be baselined at P2 exit. */
export function isHardGuardrailEntry(entry: {
  rule: string;
  page: string;
  selector: string;
  inNav?: boolean;
}): boolean {
  if (entry.rule === 'measure/hit-area') return true;
  if (entry.rule === 'measure/overflow') return true;
  if (entry.rule === 'impeccable/nested-cards') return true;
  if (entry.rule === 'impeccable/low-contrast') return true;
  if (entry.rule === 'axe/color-contrast') return true;
  if (entry.rule === 'measure/font-size') return entry.page.startsWith('/student');
  if (entry.rule === 'measure/clipped-text') return entry.inNav === true || /(^|[ >])nav(:|$| )/.test(entry.selector);
  return false;
}
