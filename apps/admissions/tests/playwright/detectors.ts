/**
 * Pure DOM defect detectors for the launch-verification Mobile_UI_Gate (Gate 4).
 *
 * Spec: `beanola-launch-verification` (task 5.1, Requirements 4.3–4.8).
 *
 * These are the deterministic pure-logic core of the mobile rendered-UI gate.
 * Each detector is a pure predicate over plain data shapes (`ElementShape`,
 * `ViewportShape`, `PageShape`) — there are **zero Playwright imports** in this
 * module. The Playwright spec (`launch-mobile-ui.spec.ts`, task 5.4) collects the
 * relevant element shapes in page context and calls these detectors; the caller
 * records the route + viewport the defects were found at.
 *
 * Because the detectors operate on synthetic data, they are unit- and
 * property-testable against synthetic DOM fixtures independent of a live browser
 * (task 5.2). Given a fixed input, every detector returns a deterministic result
 * and fires if and only if its specific defect is present.
 */

/**
 * Minimum interactive touch-target dimension, in CSS pixels.
 *
 * Mirrors the platform design guardrail (touch targets >= 44x44 px) and
 * Requirement 4.5.
 */
export const TOUCH_TARGET_MIN_PX = 44;

/** Tolerance, in CSS pixels, for the horizontal-overflow comparison (Requirement 4.3). */
export const HORIZONTAL_OVERFLOW_TOLERANCE_PX = 1;

/** Closed set of mobile-UI defect kinds this module can detect. */
export type DefectKind =
  | 'horizontal-overflow'
  | 'clipped-button-text'
  | 'undersized-touch-target'
  | 'icon-only-without-accessible-name'
  | 'overlapping-regions'
  | 'broken-dialog';

/** All defect kinds, enumerated for runtime validation in tests. */
export const DEFECT_KINDS: readonly DefectKind[] = [
  'horizontal-overflow',
  'clipped-button-text',
  'undersized-touch-target',
  'icon-only-without-accessible-name',
  'overlapping-regions',
  'broken-dialog',
] as const;

/** A bounding rectangle in CSS pixels (origin top-left). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The active viewport size in CSS pixels. */
export interface ViewportShape {
  width: number;
  height: number;
}

/**
 * Plain-data shape of a single DOM element captured in page context.
 *
 * Every field is optional so a caller can populate only what a given detector
 * needs. Detectors ignore elements missing the fields they require, which keeps
 * each detector deterministic and side-effect free.
 */
export interface ElementShape {
  /** Stable identifier used when recording an offender (selector, test id, etc.). */
  id?: string;
  /** Lower-cased tag name, e.g. `button`. */
  tag?: string;
  /** ARIA role, e.g. `button`, `dialog`. */
  role?: string;
  /** Rendered bounding rectangle. */
  rect?: Rect;
  /** `clientWidth` of the control's text container. */
  clientWidth?: number;
  /** `scrollWidth` of the control's text content. */
  textScrollWidth?: number;
  /** Pre-resolved accessible name, if the caller already computed one. */
  accessibleName?: string;
  /** Raw `aria-label` attribute value. */
  ariaLabel?: string;
  /** Resolved text of the `aria-labelledby` target(s). */
  ariaLabelledbyText?: string;
  /** Trimmed visible text content. */
  textContent?: string;
  /** Whether the element is an interactive control (button, link, input, etc.). */
  isInteractive?: boolean;
  /**
   * Grouping key identifying sibling layout regions. Regions sharing the same
   * key are compared pairwise for overlap; regions with no key are treated as a
   * single default sibling group.
   */
  siblingGroup?: string;
  /** Whether the close/dismiss control of a dialog is present and operable. */
  hasCloseControl?: boolean;
  /** Whether focus is contained within the dialog while it is open. */
  hasFocusContainment?: boolean;
  /** Whether the dialog can be dismissed via the Escape key. */
  dismissibleByEscape?: boolean;
}

/**
 * The full page snapshot a single route+viewport check evaluates.
 *
 * `controls`, `regions`, and `dialogs` are pre-filtered candidate lists the
 * caller extracts from the live DOM; the detectors apply their own predicates
 * on top.
 */
export interface PageShape {
  viewport: ViewportShape;
  /** `document.body.scrollWidth` for the horizontal-overflow check. */
  bodyScrollWidth: number;
  /** Candidate interactive controls (buttons, links, inputs). */
  controls: ElementShape[];
  /** Sibling card/table/form layout regions. */
  regions: ElementShape[];
  /** Currently-open dialogs. */
  dialogs: ElementShape[];
}

/** A single detected defect plus the offender details the caller records. */
export interface Defect {
  kind: DefectKind;
  /** Identifier of the offending element (for pairs, both ids joined). */
  offender: string;
  /** For multi-element defects (overlap), the individual offender ids. */
  offenders?: string[];
  /** Human-readable explanation, including the measured values that fired. */
  detail: string;
}

/** Best-effort stable identifier for an element shape. */
function elementId(el: ElementShape): string {
  if (el.id && el.id.trim()) return el.id.trim();
  if (el.role && el.role.trim()) return `role=${el.role.trim()}`;
  if (el.tag && el.tag.trim()) return `tag=${el.tag.trim()}`;
  return 'unknown-element';
}

/** True only when `value` is a finite number. */
function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Resolve the accessible name for an element from, in priority order, a
 * pre-resolved name, `aria-label`, `aria-labelledby` text, then text content.
 * Returns the empty string when no non-empty name source exists.
 */
export function resolveAccessibleName(el: ElementShape): string {
  const sources = [el.accessibleName, el.ariaLabel, el.ariaLabelledbyText, el.textContent];
  for (const source of sources) {
    if (typeof source === 'string' && source.trim().length > 0) {
      return source.trim();
    }
  }
  return '';
}

/** True when two rectangles share a strictly-positive overlap area. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > 0 && overlapY > 0;
}

/**
 * Detector 1 — Horizontal overflow (Requirement 4.3).
 *
 * Fires when the document body's `scrollWidth` exceeds the active viewport width
 * by more than 1 px. Returns the single defect, or `null` when within tolerance.
 */
export function detectHorizontalOverflow(
  bodyScrollWidth: number,
  viewport: ViewportShape,
): Defect | null {
  if (!isFiniteNumber(bodyScrollWidth) || !isFiniteNumber(viewport.width)) {
    return null;
  }
  if (bodyScrollWidth > viewport.width + HORIZONTAL_OVERFLOW_TOLERANCE_PX) {
    return {
      kind: 'horizontal-overflow',
      offender: 'document.body',
      detail: `body scrollWidth ${bodyScrollWidth}px exceeds viewport width ${viewport.width}px by more than ${HORIZONTAL_OVERFLOW_TOLERANCE_PX}px`,
    };
  }
  return null;
}

/**
 * Detector 2 — Clipped button text (Requirement 4.4).
 *
 * Fires for each control whose text `scrollWidth` exceeds its rendered
 * `clientWidth`, indicating the label is visually clipped.
 */
export function detectClippedButtonText(controls: ElementShape[]): Defect[] {
  const defects: Defect[] = [];
  for (const control of controls) {
    if (!isFiniteNumber(control.textScrollWidth) || !isFiniteNumber(control.clientWidth)) {
      continue;
    }
    if (control.textScrollWidth > control.clientWidth) {
      defects.push({
        kind: 'clipped-button-text',
        offender: elementId(control),
        detail: `text scrollWidth ${control.textScrollWidth}px exceeds clientWidth ${control.clientWidth}px`,
      });
    }
  }
  return defects;
}

/**
 * Detector 3 — Undersized touch target (Requirement 4.5).
 *
 * Fires for each interactive control whose rendered width or height is smaller
 * than {@link TOUCH_TARGET_MIN_PX}.
 */
export function detectUndersizedTouchTargets(controls: ElementShape[]): Defect[] {
  const defects: Defect[] = [];
  for (const control of controls) {
    if (control.isInteractive !== true || !control.rect) {
      continue;
    }
    const { width, height } = control.rect;
    if (!isFiniteNumber(width) || !isFiniteNumber(height)) {
      continue;
    }
    if (width < TOUCH_TARGET_MIN_PX || height < TOUCH_TARGET_MIN_PX) {
      defects.push({
        kind: 'undersized-touch-target',
        offender: elementId(control),
        detail: `interactive target ${width}x${height}px is smaller than ${TOUCH_TARGET_MIN_PX}x${TOUCH_TARGET_MIN_PX}px`,
      });
    }
  }
  return defects;
}

/**
 * Detector 4 — Icon-only control without accessible name (Requirement 4.6).
 *
 * Fires for each interactive control that resolves to no non-empty accessible
 * name from text content, `aria-label`, or `aria-labelledby`.
 */
export function detectIconOnlyControlsWithoutName(controls: ElementShape[]): Defect[] {
  const defects: Defect[] = [];
  for (const control of controls) {
    if (control.isInteractive !== true) {
      continue;
    }
    if (resolveAccessibleName(control).length === 0) {
      defects.push({
        kind: 'icon-only-without-accessible-name',
        offender: elementId(control),
        detail: 'interactive control has no accessible name from text, aria-label, or aria-labelledby',
      });
    }
  }
  return defects;
}

/**
 * Detector 5 — Overlapping layout regions (Requirement 4.7).
 *
 * Fires for each pair of sibling card/table/form regions whose bounding
 * rectangles intersect. Regions are grouped by {@link ElementShape.siblingGroup}
 * (regions without a group form a single default sibling group); only regions
 * within the same group are compared.
 */
export function detectOverlappingRegions(regions: ElementShape[]): Defect[] {
  const defects: Defect[] = [];
  const groups = new Map<string, ElementShape[]>();
  for (const region of regions) {
    if (!region.rect) {
      continue;
    }
    const key = region.siblingGroup && region.siblingGroup.trim().length > 0
      ? region.siblingGroup.trim()
      : '__default__';
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(region);
    } else {
      groups.set(key, [region]);
    }
  }
  for (const bucket of groups.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i];
        const b = bucket[j];
        if (!a || !b || !a.rect || !b.rect) {
          continue;
        }
        if (rectsIntersect(a.rect, b.rect)) {
          const aId = elementId(a);
          const bId = elementId(b);
          defects.push({
            kind: 'overlapping-regions',
            offender: `${aId} <-> ${bId}`,
            offenders: [aId, bId],
            detail: 'sibling layout regions have intersecting bounding rectangles',
          });
        }
      }
    }
  }
  return defects;
}

/**
 * Detector 6 — Broken dialog (Requirement 4.8).
 *
 * Fires for each dialog that either loses focus containment, or cannot be
 * dismissed by both the Escape key and its close control (a dialog must offer at
 * least one working dismissal mechanism).
 */
export function detectBrokenDialogs(dialogs: ElementShape[]): Defect[] {
  const defects: Defect[] = [];
  for (const dialog of dialogs) {
    const losesFocusContainment = dialog.hasFocusContainment !== true;
    const cannotBeDismissed = dialog.dismissibleByEscape !== true && dialog.hasCloseControl !== true;
    if (losesFocusContainment || cannotBeDismissed) {
      const reasons: string[] = [];
      if (losesFocusContainment) reasons.push('loses focus containment');
      if (cannotBeDismissed) reasons.push('cannot be dismissed by Escape or its close control');
      defects.push({
        kind: 'broken-dialog',
        offender: elementId(dialog),
        detail: `dialog ${reasons.join(' and ')}`,
      });
    }
  }
  return defects;
}

/**
 * Run every detector over a single route+viewport page snapshot and return the
 * flat list of fired defects (empty when the page is clean).
 *
 * The caller is responsible for recording the route and viewport against the
 * returned defects.
 */
export function runDetectors(page: PageShape): Defect[] {
  const defects: Defect[] = [];
  const overflow = detectHorizontalOverflow(page.bodyScrollWidth, page.viewport);
  if (overflow) {
    defects.push(overflow);
  }
  defects.push(...detectClippedButtonText(page.controls));
  defects.push(...detectUndersizedTouchTargets(page.controls));
  defects.push(...detectIconOnlyControlsWithoutName(page.controls));
  defects.push(...detectOverlappingRegions(page.regions));
  defects.push(...detectBrokenDialogs(page.dialogs));
  return defects;
}
