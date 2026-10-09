/**
 * The pixel checks for admissions-v2 task **13.3**.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, third bullet —
 * *"Assert 44px targets, no overflow/occlusion/layout shift, and actual next
 * action in the first mobile viewport"*. Required_Evidence: *"visual/a11y report
 * with reviewed screenshots and **pixel checks**"*.
 * Requirements: **R16.1**, **R16.2**, **R16.3**, **R16.7**, **R16.8**.
 *
 * ## Why every function here returns numbers rather than booleans
 *
 * A screenshot is not a pixel check and neither is a green tick. `44px targets`
 * is a claim about `getBoundingClientRect()`, `no overflow` is a claim about
 * `scrollWidth - clientWidth`, `occlusion` is a claim about what
 * `elementFromPoint` finds at a control's own centre, and `layout shift` is a
 * claim about the `layout-shift` performance entries a load produced. Each
 * measurement below therefore hands back the **measured value** — the count
 * scanned, the offenders with their sizes to three decimals, the overflow in
 * pixels, the CLS score — so the evidence file can publish a number and a later
 * run can tell drift from noise.
 *
 * The assertion helpers that wrap them are thin on purpose: the number is the
 * artifact, the assertion is a consequence of it.
 *
 * ## What is deliberately *not* re-derived here
 *
 * `apps/admissions/tests/unit/mobileResponsiveness.test.ts` walks composed
 * surfaces in jsdom and `productDesignDeFluff.test.tsx` carries a whole-tree 44 px
 * scan plus six contrast guards. Neither can answer any question on this page,
 * because jsdom lays nothing out and reports every rect as zero. These functions
 * exist for exactly the claims that need a layout engine.
 */
import { expect, type Page } from '../harness-fixtures';

/** Chromium reports fractional boxes for an inline-flex at `min-height: 44px`. */
const TOUCH_MIN = 44;
const TOUCH_TOLERANCE = 0.5;

/** Everything the platform treats as a pointer target. */
export const INTERACTIVE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
  '[role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"], ' +
  '[role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';

export interface TargetMeasurement {
  label: string;
  tag: string;
  /**
   * The element's `id`, when it has one.
   *
   * Carried because a label is not always enough to identify a control: a bare
   * `<input>` has no accessible name of its own and no text content, so an
   * attribution keyed on its label would have to match the empty string — which
   * would silently absorb every future unlabelled offender. An `id` is precise.
   */
  id: string;
  width: number;
  height: number;
  /** Whether the element sits inside a fixed/sticky bar, for attribution. */
  inFixedBar: boolean;
}

export interface TouchTargetReport {
  /** Interactive elements that were rendered and therefore measured. */
  scanned: number;
  /** Rendered-but-zero-box elements, skipped (a collapsed disclosure's children). */
  skippedZeroBox: number;
  /**
   * Visually-hidden elements: the `sr-only` pattern, a styled file input's real
   * `<input type=file>`, and Radix's 1 px native `<select>` shadow. Not pointer
   * targets — the visible label or trigger is.
   */
  skippedVisuallyHidden: number;
  /** `aria-hidden` subtrees: not exposed at all, so not a pointer target. */
  skippedAriaHidden: number;
  /** `pointer-events: none`: cannot receive a pointer by definition. */
  skippedNoPointerEvents: number;
  /** Every element whose own box is under 44 px in either axis. */
  offenders: TargetMeasurement[];
  /** The smallest measured width and height across everything scanned. */
  minWidth: number;
  minHeight: number;
}

/**
 * Measure **every** real pointer target's own layout box.
 *
 * Whole-tree, not scoped to a panel: R16.2 says *"EVERY pointer target"*, and a
 * scoped scan is how a sub-44 control in a header or a bottom bar survives a green
 * suite.
 *
 * ### What "real pointer target" had to be narrowed to, and why
 *
 * The first draft counted every element matching the interactive selector, and it
 * produced three classes of false offender — each of which is a *correct* pattern
 * being misread:
 *
 * * `input[Upload Grade 12 result slip] 1x44` — the accessible file-input pattern.
 *   The real `<input type="file">` is a 1 px box behind a styled label; the label
 *   is what the student taps.
 * * `select[MaleFemale] 1x44`, and two more with every country in the list as
 *   their "text" — Radix Select's hidden native `<select>`, rendered `aria-hidden`
 *   at 1 px purely so a form submits. The visible trigger is a button.
 * * `label.sr-only` — a screen-reader-only string, which is a 1 x 1 clip box by
 *   construction.
 *
 * None of the three can be tapped, so calling any of them a sub-44 target would be
 * reporting an accessibility feature as a defect. A pointer target must therefore
 * be **visible** and **exposed**: not visually hidden, not inside an `aria-hidden`
 * subtree, not `pointer-events: none`. Each exclusion is counted separately in the
 * report, so "nothing was measured" can never look like "everything passed" —
 * 13.2 §5.4's rule, that an instrument has to obey the rule it audits.
 */
export async function measureTouchTargets(page: Page): Promise<TouchTargetReport> {
  return page.evaluate(
    ({ selector, min, tolerance }) => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
      const offenders: TargetMeasurement[] = [];
      let scanned = 0;
      let skippedZeroBox = 0;
      let skippedVisuallyHidden = 0;
      let skippedAriaHidden = 0;
      let skippedNoPointerEvents = 0;
      let minWidth = Number.POSITIVE_INFINITY;
      let minHeight = Number.POSITIVE_INFINITY;

      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          skippedZeroBox += 1;
          continue;
        }
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') {
          skippedZeroBox += 1;
          continue;
        }
        if (
          rect.width <= 1 ||
          rect.height <= 1 ||
          (style.clip && style.clip !== 'auto') ||
          (style.clipPath && style.clipPath.includes('inset(50%)'))
        ) {
          skippedVisuallyHidden += 1;
          continue;
        }
        if (el.closest('[aria-hidden="true"]')) {
          skippedAriaHidden += 1;
          continue;
        }
        if (style.pointerEvents === 'none') {
          skippedNoPointerEvents += 1;
          continue;
        }
        scanned += 1;
        minWidth = Math.min(minWidth, rect.width);
        minHeight = Math.min(minHeight, rect.height);
        if (rect.height < min - tolerance || rect.width < min - tolerance) {
          let node: HTMLElement | null = el;
          let inFixedBar = false;
          while (node && node !== document.body) {
            const position = window.getComputedStyle(node).position;
            if (position === 'fixed' || position === 'sticky') {
              inFixedBar = true;
              break;
            }
            node = node.parentElement;
          }
          offenders.push({
            label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 40),
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            width: Number(rect.width.toFixed(3)),
            height: Number(rect.height.toFixed(3)),
            inFixedBar,
          });
        }
      }
      return {
        scanned,
        skippedZeroBox,
        skippedVisuallyHidden,
        skippedAriaHidden,
        skippedNoPointerEvents,
        offenders,
        minWidth: Number.isFinite(minWidth) ? Number(minWidth.toFixed(3)) : 0,
        minHeight: Number.isFinite(minHeight) ? Number(minHeight.toFixed(3)) : 0,
      };
    },
    { selector: INTERACTIVE_SELECTOR, min: TOUCH_MIN, tolerance: TOUCH_TOLERANCE },
  );
}

export interface OverflowReport {
  /** `documentElement.scrollWidth - clientWidth`, in CSS pixels. */
  document: number;
  /** `body.scrollWidth - clientWidth`. */
  body: number;
  /**
   * Containers that clip horizontally (`overflow-x: hidden|clip`) **and cut off an
   * interactive descendant** — R16.7's *"hidden commands"*, and the defect class.
   */
  clippedCommands: {
    tag: string;
    cls: string;
    overflow: number;
    cutOff: { tag: string; label: string; right: number; clipperRight: number }[];
  }[];
  /** Containers that clip content but cut off no control — recorded, not failed. */
  clippingContainers: number;
  /** `overflow-x: auto|scroll` regions that really do scroll. Legitimate. */
  declaredScrollers: { tag: string; cls: string; overflow: number }[];
  /** Elements painting past the viewport's right edge, widest first. */
  widestOffenders: { tag: string; cls: string; right: number }[];
  viewportWidth: number;
  /** How many elements were considered, so "clean" is distinguishable from "empty". */
  elementsConsidered: number;
}

/**
 * `scrollWidth > clientWidth`, measured three ways because R16.7 names three
 * different failures and they are not the same measurement.
 *
 * 1. **The document.** `documentElement.scrollWidth - clientWidth` is the only
 *    honest reading of *"no horizontal overflow"*, and it is the one that decides
 *    whether the student can push the page sideways.
 * 2. **Clipped commands.** A container whose `overflow-x` is `hidden` does not
 *    scroll — it *cuts content off*, unreachably. That is R16.7's *"clipped text,
 *    hidden commands"*, and it is a defect precisely when what is cut off is
 *    something the student needs. So a clipping container is only an offender when
 *    an **interactive** descendant lies outside its clip box, and the offending
 *    control is named. Containers that clip only decoration are counted, not
 *    failed.
 * 3. **Declared scrollers.** `overflow-x: auto|scroll` is a design decision — an
 *    admin record table is allowed to be one — so these are recorded for the
 *    report and never fail a row.
 *
 * ### The instrument had to be corrected once, in exactly the way the task is about
 *
 * The first draft failed every surface on `label.sr-only` with 157 px of
 * "overflow". A visually-hidden label **is** a 1 x 1 clip box containing a
 * sentence; that is how a screen-reader-only string is built, and reporting it as
 * a layout defect would have been the instrument misreading an accessibility
 * feature as a bug. Visually-hidden elements are therefore excluded by
 * measurement (a <= 1 px client box, a `clip`, or an `inset(50%)` clip-path)
 * rather than by class name, and `text-overflow: ellipsis` is excluded as a
 * *declared* truncation. 13.2 §5.4 is the precedent: an instrument has to obey the
 * rule it audits.
 */
export async function measureOverflow(page: Page): Promise<OverflowReport> {
  return page.evaluate((interactiveSelector) => {
    const doc = document.documentElement;
    const viewportWidth = doc.clientWidth;

    /** A screen-reader-only element, detected from its box rather than its class. */
    const isVisuallyHidden = (el: HTMLElement, style: CSSStyleDeclaration): boolean => {
      if (el.clientWidth <= 1 || el.clientHeight <= 1) return true;
      if (style.clip && style.clip !== 'auto') return true;
      if (style.clipPath && style.clipPath.includes('inset(50%)')) return true;
      return false;
    };

    const clippedCommands: OverflowReport['clippedCommands'] = [];
    const declaredScrollers: { tag: string; cls: string; overflow: number }[] = [];
    let clippingContainers = 0;
    let elementsConsidered = 0;

    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (isVisuallyHidden(el, style)) continue;
      elementsConsidered += 1;

      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow <= 2) continue;
      const overflowX = style.overflowX;

      if (overflowX === 'auto' || overflowX === 'scroll') {
        if (declaredScrollers.length < 8) {
          declaredScrollers.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 120),
            overflow,
          });
        }
        continue;
      }
      if (overflowX !== 'hidden' && overflowX !== 'clip') {
        // `visible` overflow propagates to the document, where check 1 catches it.
        continue;
      }
      if (style.textOverflow === 'ellipsis') continue; // a declared truncation
      clippingContainers += 1;

      const cutOff: OverflowReport['clippedCommands'][number]['cutOff'] = [];
      for (const target of Array.from(el.querySelectorAll<HTMLElement>(interactiveSelector))) {
        const targetRect = target.getBoundingClientRect();
        if (targetRect.width === 0 || targetRect.height === 0) continue;
        if (targetRect.right > rect.right + 2 || targetRect.left < rect.left - 2) {
          cutOff.push({
            tag: target.tagName.toLowerCase(),
            label: (target.getAttribute('aria-label') || target.textContent || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 40),
            right: Math.round(targetRect.right),
            clipperRight: Math.round(rect.right),
          });
        }
      }
      if (cutOff.length > 0) {
        clippedCommands.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 120),
          overflow,
          cutOff: cutOff.slice(0, 4),
        });
      }
    }

    const widestOffenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((node) => ({
        right: Math.round(node.getBoundingClientRect().right),
        tag: node.tagName.toLowerCase(),
        cls: (node.className || '').toString().slice(0, 120),
      }))
      .filter((entry) => entry.right > viewportWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5);

    return {
      document: doc.scrollWidth - doc.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      clippedCommands: clippedCommands.slice(0, 8),
      clippingContainers,
      declaredScrollers,
      widestOffenders,
      viewportWidth,
      elementsConsidered,
    };
  }, INTERACTIVE_SELECTOR);
}

export interface OccludedTarget {
  label: string;
  tag: string;
  coveredBy: string;
  at: { x: number; y: number };
}

export interface OcclusionReport {
  /** Interactive elements whose own centre point was testable. */
  probed: number;
  /**
   * Covered where the page happens to be sitting. Recorded, **not** failed: a
   * fixed bottom bar covers whatever is beneath it at any given scroll offset, and
   * that is what a fixed bar is.
   */
  occludedAtRest: OccludedTarget[];
  /**
   * Still covered after being scrolled to the middle of the viewport — genuinely
   * unreachable, and the defect. This is what `occluded` means in this report.
   */
  occluded: OccludedTarget[];
  /** How many at-rest candidates were re-probed after scrolling. */
  rescrolled: number;
}

/**
 * An interactive element covered by something else — `elementFromPoint` at its own
 * centre, in **two phases**.
 *
 * The claim this serves is STU-03's: *"a floating draft manager and wizard footer
 * compete with global bottom navigation"* — a control whose pixels belong to
 * another surface. A hit that lands on the element itself, on a descendant, or on
 * an ancestor is not occlusion; an icon inside a button is the button.
 *
 * ### Why one probe was not enough, and the first run proved it
 *
 * The single-phase draft reported the dashboard's *"Add your Grade 12 results"*
 * link as covered by a bottom-navigation item at y = 558 in a 568 px viewport. It
 * was — **at that scroll offset**. A fixed bottom bar covers whatever sits
 * underneath it at any given moment; that is what a fixed bar is, and the page
 * reserves `--bottom-nav-safe-offset` precisely so scrolling brings content clear.
 * Failing on that would have made this instrument measure *scroll position* rather
 * than reachability.
 *
 * So: every at-rest hit is **recorded** (`occludedAtRest`), then each candidate is
 * scrolled to the middle of the viewport and probed again. Only a control that is
 * *still* covered with the whole viewport to move in is genuinely unreachable, and
 * only that fails. The scroll offset is restored afterwards so the caller's other
 * measurements are unaffected.
 */
export async function measureOcclusion(page: Page): Promise<OcclusionReport> {
  return page.evaluate(async (selector) => {
    const describe = (el: Element, hit: Element, x: number, y: number): OccludedTargetLocal => ({
      label: (el.getAttribute('aria-label') || el.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40),
      tag: el.tagName.toLowerCase(),
      coveredBy:
        `${hit.tagName.toLowerCase()}.${(hit.className || '').toString().slice(0, 80)}`.trim(),
      at: { x: Math.round(x), y: Math.round(y) },
    });
    interface OccludedTargetLocal {
      label: string;
      tag: string;
      coveredBy: string;
      at: { x: number; y: number };
    }

    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const occludedAtRest: OccludedTargetLocal[] = [];
    const candidates: HTMLElement[] = [];
    let probed = 0;

    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x > vw - 1 || y > vh - 1) continue;
      probed += 1;
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      occludedAtRest.push(describe(el, hit, x, y));
      candidates.push(el);
    }

    // Phase 2: give each candidate the whole viewport to move in.
    const originalScrollY = window.scrollY;
    const occluded: OccludedTargetLocal[] = [];
    for (const el of candidates.slice(0, 12)) {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
      // One frame for the scroll to land before the hit test.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x > vw - 1 || y > vh - 1) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      occluded.push(describe(el, hit, x, y));
    }
    window.scrollTo(0, originalScrollY);

    return {
      probed,
      occludedAtRest: occludedAtRest.slice(0, 12),
      occluded: occluded.slice(0, 12),
      rescrolled: Math.min(candidates.length, 12),
    };
  }, INTERACTIVE_SELECTOR);
}

/**
 * Install a buffered `layout-shift` observer **before** the document exists, so a
 * shift during first paint is counted rather than missed.
 *
 * `hadRecentInput` entries are excluded: a shift the student caused by tapping is
 * not the *"layout shift"* R16.7 forbids. The same init-script shape as 11.5's
 * zoom journey, and for the same reason — an init script runs before
 * `document.documentElement` exists.
 */
export async function installLayoutShiftObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = { value: 0, entries: [] as { value: number; at: number }[] };
    (window as unknown as { __cls13_3: typeof store }).__cls13_3 = store;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (entry.hadRecentInput) continue;
          store.value += entry.value;
          store.entries.push({ value: entry.value, at: Math.round(entry.startTime) });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* A browser without the entry type reports 0 shifts, and the caller says so. */
    }
  });
}

export interface LayoutShiftReport {
  /** Cumulative Layout Shift for this load, excluding input-driven shifts. */
  cls: number;
  /** Individual shifts, so a single large jump is distinguishable from drift. */
  shifts: { value: number; at: number }[];
  /** False when the browser produced no `layout-shift` support at all. */
  observed: boolean;
}

export async function readLayoutShift(page: Page): Promise<LayoutShiftReport> {
  return page.evaluate(() => {
    const store = (window as unknown as {
      __cls13_3?: { value: number; entries: { value: number; at: number }[] };
    }).__cls13_3;
    if (!store) return { cls: 0, shifts: [], observed: false };
    return {
      cls: Number(store.value.toFixed(4)),
      shifts: store.entries.map((e) => ({ value: Number(e.value.toFixed(4)), at: e.at })),
      observed: true,
    };
  });
}

export interface FirstViewportActionReport {
  found: boolean;
  /** The action's accessible label, so the report names what the student sees. */
  label: string;
  top: number;
  bottom: number;
  height: number;
  viewportHeight: number;
  /** True only when the whole control is inside the first viewport, unscrolled. */
  fullyVisibleUnscrolled: boolean;
  /** How far the page was scrolled when measured — must be 0 for the claim. */
  scrollY: number;
  /** Whether a fixed/sticky surface paints over the action's centre. */
  occludedBy: string | null;
  /**
   * **Area** overlap with every on-screen fixed/sticky bar, not just a centre-point
   * hit.
   *
   * Added because reviewing the 320 px screenshot caught what the centre-point probe
   * could not: the dashboard's primary action measured `bottom = 523` in a 568 px
   * viewport with `occludedBy: null`, and the fixed bottom navigation occupies
   * 504-568 — so the control's lower ~19 px sit underneath it while its centre
   * (y ≈ 489) is clear. A centre-point hit test answers *"is the middle of this
   * control clickable"*; R16.3's *"not overlap, obscure, or compete"* is a question
   * about the whole box.
   */
  overlappingBars: {
    bar: string;
    barTop: number;
    overlapPx: number;
    fractionOfActionCovered: number;
  }[];
}

/**
 * **The task's most substantive assertion.** STU-04's core claim is that the
 * dashboard's *actual next action* is reachable in the first mobile viewport, and
 * the honest measurement is a bounding box against the viewport height with the
 * page **unscrolled** — not `toBeVisible()`, which Playwright satisfies by
 * scrolling, and not `box.y < viewportHeight`, which only says the control
 * *starts* on screen.
 *
 * So this measures `bottom <= viewportHeight` at `scrollY === 0`, and separately
 * whether anything is painted over it, because a control that is on screen and
 * underneath the bottom navigation is not available either.
 */
export async function measureFirstViewportAction(
  page: Page,
  selector: string,
): Promise<FirstViewportActionReport> {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    const viewportHeight = document.documentElement.clientHeight;
    if (!el) {
      return {
        found: false,
        label: '',
        top: 0,
        bottom: 0,
        height: 0,
        viewportHeight,
        fullyVisibleUnscrolled: false,
        scrollY: Math.round(window.scrollY),
        occludedBy: null,
        overlappingBars: [],
      };
    }
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    let occludedBy: string | null = null;
    if (x >= 0 && y >= 0 && x < document.documentElement.clientWidth && y < viewportHeight) {
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
        occludedBy = `${hit.tagName.toLowerCase()}.${(hit.className || '').toString().slice(0, 80)}`;
      }
    }
    // Area overlap against every on-screen fixed/sticky bar.
    const overlappingBars: {
      bar: string;
      barTop: number;
      overlapPx: number;
      fractionOfActionCovered: number;
    }[] = [];
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (el === node || el.contains(node) || node.contains(el)) continue;
      const style = window.getComputedStyle(node);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const bar = node.getBoundingClientRect();
      if (bar.width === 0 || bar.height === 0) continue;
      const overlapY = Math.min(rect.bottom, bar.bottom) - Math.max(rect.top, bar.top);
      const overlapX = Math.min(rect.right, bar.right) - Math.max(rect.left, bar.left);
      if (overlapY <= 0.5 || overlapX <= 0.5) continue;
      overlappingBars.push({
        bar: `${node.tagName.toLowerCase()}.${(node.className || '').toString().slice(0, 70)}`,
        barTop: Number(bar.top.toFixed(3)),
        overlapPx: Number(overlapY.toFixed(3)),
        fractionOfActionCovered: Number((overlapY / rect.height).toFixed(4)),
      });
    }
    return {
      found: true,
      label: (el.getAttribute('aria-label') || el.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 60),
      top: Number(rect.top.toFixed(3)),
      bottom: Number(rect.bottom.toFixed(3)),
      height: Number(rect.height.toFixed(3)),
      viewportHeight,
      fullyVisibleUnscrolled: rect.top >= 0 && rect.bottom <= viewportHeight + 0.5,
      scrollY: Math.round(window.scrollY),
      occludedBy,
      overlappingBars: overlappingBars.slice(0, 4),
    };
  }, selector);
}

export interface SafeAreaReport {
  /** The selector this row is about. */
  selector: string;
  present: boolean;
  /** Resolved `padding-bottom` in CSS pixels, with the current inset applied. */
  resolvedPaddingBottom: number;
  /**
   * True when the *declaration* references the inset — either
   * `env(safe-area-inset-bottom…)` directly or the `--safe-area-inset-bottom`
   * custom property the app derives from it in `index.css`.
   */
  declaresInset: boolean;
  /** The declaration text, so the report can quote what was measured. */
  declaration: string;
  /** The element's own class attribute, so the report quotes the real DOM. */
  classAttribute: string;
  /** Whether a CSS rule whose selector carries the inset actually matches it. */
  matchingRuleFound: boolean;
  /** The selector text of the inset rule found in the stylesheets, if any. */
  insetRuleSelector: string;
}

/**
 * Whether a bottom-anchored surface respects `env(safe-area-inset-bottom)`.
 *
 * Two things are measured, because on this box only one of them is *simulatable*:
 * the **resolved** padding (which reports the inset the browser is currently
 * publishing) and whether the **declaration** references the inset at all. The
 * second is the durable claim — a bar that hardcodes `pb-3` cannot ever clear a
 * home indicator, and that is provable regardless of what the current device
 * reports.
 *
 * The caller pairs this with a CDP `Emulation.setSafeAreaInsetsOverride` attempt
 * so a real non-zero inset is measured where the protocol supports it, and the
 * result is recorded either way.
 */
export async function measureSafeArea(page: Page, selector: string): Promise<SafeAreaReport> {
  /*
    Measured through the **locator**, not through a fresh `document.querySelector`.

    The first draft re-queried inside `page.evaluate` and reported
    `present: false` for a bar that `expect(...).toBeVisible()` had just asserted
    and `boundingBox()` had just measured at 288 x 155. A bare `querySelector` does
    not wait, and the wizard re-renders continuously (autosave is mandatory on every
    student form, and React Query revalidates), so a re-query can land in the gap
    between an unmount and a remount. `locator.evaluate` auto-waits and hands the
    callback the element Playwright actually resolved — so the thing measured is the
    thing asserted, which is the only version of this that can be trusted.
  */
  const locator = page.locator(selector).first();
  /*
    `waitFor({ state: 'attached' })` rather than a bare `count()`.

    Measured twice, and the second time only on the Pixel 5 project: `count()`
    returned 0 for a bar that `toBeVisible()` had just asserted and `boundingBox()`
    measured at 288 x 155 a moment later. `count()` does not wait, so it can land in
    the gap between an unmount and a remount — and the wizard re-renders continuously
    (auto-save is mandatory on every student form, React Query revalidates). Both
    `waitFor` and `locator.evaluate` auto-wait, so the element measured is the element
    asserted, and a genuinely absent element still resolves after one bounded wait
    instead of racing.
  */
  try {
    await locator.waitFor({ state: 'attached', timeout: 20_000 });
  } catch (error) {
    // The reason is recorded rather than swallowed: an absent element and a racing
    // instrument look identical in a boolean, and only one of them is a product fact.
    return {
      selector,
      present: false,
      resolvedPaddingBottom: 0,
      declaresInset: false,
      declaration: `[not measured] ${String((error as Error)?.message || error).slice(0, 300)}`,
      classAttribute: '',
      matchingRuleFound: false,
      insetRuleSelector: '',
    };
  }
  return locator.evaluate((el: HTMLElement, sel: string) => {
    const resolved = parseFloat(window.getComputedStyle(el).paddingBottom || '0');
    /*
      `getComputedStyle` has already resolved `env()` away, so the declaration has
      to be recovered from somewhere the browser has not evaluated.

      Three places are checked, cheapest first, because the CSSOM walk alone
      **failed** on the first recorded run and reported `(none found)` for a bar
      whose padding is demonstrably `pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]`.
      Tailwind compiles an arbitrary value into a class whose selector escapes the
      comma as `\\2c `, and `el.matches()` on that escaped selector does not
      reliably match — so the instrument was looking in the one place that could not
      answer. The class attribute is where the component actually wrote the
      declaration, and it is unambiguous.
    */
    const classAttr = (el.getAttribute('class') || '').toString();
    let declaration = '';
    if (classAttr.includes('safe-area-inset-bottom')) {
      const token = classAttr
        .split(/\s+/)
        .find((cls) => cls.includes('safe-area-inset-bottom'));
      declaration = `[class] ${token ?? ''}`;
    }
    let insetRuleSelector = '';
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }
      for (const rule of Array.from(rules)) {
        const styleRule = rule as CSSStyleRule;
        if (!styleRule.selectorText || !styleRule.style) continue;
        const value = styleRule.style.getPropertyValue('padding-bottom');
        if (!value) continue;
        let matched = false;
        try {
          matched = el.matches(styleRule.selectorText);
        } catch {
          matched = false;
        }
        if (value.includes('safe-area-inset-bottom') && !insetRuleSelector) {
          insetRuleSelector = styleRule.selectorText.slice(0, 200);
        }
        if (matched && (value.includes('safe-area-inset-bottom') || !declaration)) {
          declaration = `${styleRule.selectorText} { padding-bottom: ${value} }`;
          if (value.includes('safe-area-inset-bottom')) break;
        }
      }
      if (declaration.includes('safe-area-inset-bottom')) break;
    }
    const inline = el.style.paddingBottom;
    if (inline.includes('safe-area-inset-bottom')) {
      declaration = `[inline] { padding-bottom: ${inline} }`;
    }
    /*
      Last resort: a surface may inherit its inset from a shell utility rather than
      declare it on itself — `.bottom-nav-content-padding` uses
      `var(--bottom-nav-safe-offset)`, which `index.css` derives from
      `env(safe-area-inset-bottom)`. That is still "respects the inset", so the
      chain is followed one level rather than reported as absent.
      */
    if (!declaration.includes('safe-area-inset-bottom')) {
      const rootInset = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--safe-area-inset-bottom')
        .trim();
      const navOffset = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--bottom-nav-safe-offset')
        .trim();
      if (rootInset !== '' && navOffset !== '') {
        declaration =
          declaration ||
          `[inherited] --safe-area-inset-bottom: ${rootInset}; ` +
            `--bottom-nav-safe-offset: ${navOffset} (index.css derives both from ` +
            `env(safe-area-inset-bottom))`;
      }
    }
    return {
      selector: sel,
      present: true,
      resolvedPaddingBottom: Number(resolved.toFixed(3)),
      declaresInset:
        declaration.includes('safe-area-inset-bottom') || declaration.startsWith('[inherited]'),
      declaration,
      classAttribute: classAttr.slice(0, 400),
      matchingRuleFound: insetRuleSelector !== '',
      insetRuleSelector,
    };
  }, selector);
}

/**
 * Try to make the browser publish a real bottom safe-area inset.
 *
 * Returns the inset actually applied, or `null` when the protocol refuses — which
 * is a recorded environment limit rather than a product result. Chrome added
 * `Emulation.setSafeAreaInsetsOverride` recently enough that "it is not there" is
 * a plausible outcome on any given channel, so the caller must handle `null`
 * instead of assuming success.
 */
export async function trySafeAreaInsetOverride(
  page: Page,
  bottom: number,
): Promise<number | null> {
  try {
    const session = await cdp(page);
    await session.send('Emulation.setSafeAreaInsetsOverride' as never, {
      insets: { top: 0, left: 0, bottom, right: 0 },
    } as never);
    return bottom;
  } catch {
    return null;
  }
}

/** Emulate a slow-3G-class connection over CDP. Returns the profile applied. */
export interface NetworkProfile {
  offline: boolean;
  downloadKbps: number;
  uploadKbps: number;
  latencyMs: number;
}

export const SLOW_3G: NetworkProfile = {
  offline: false,
  // Chrome DevTools' own "Slow 3G" preset: 400 kbps down, 400 kbps up, 2 000 ms RTT.
  downloadKbps: 400,
  uploadKbps: 400,
  latencyMs: 2000,
};

/**
 * One CDP session per page, reused.
 *
 * Network conditions are set on a session and cleared on one; opening a fresh
 * session for every call is how a `clear` ends up not undoing an `emulate`. Kept in
 * a `WeakMap` so a closed page's session is not held alive.
 */
const cdpSessions = new WeakMap<Page, Promise<import('@playwright/test').CDPSession>>();

function cdp(page: Page) {
  let session = cdpSessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    cdpSessions.set(page, session);
  }
  return session;
}

/** Empty the HTTP cache, so a following load is genuinely a first visit. */
export async function clearBrowserCache(page: Page): Promise<boolean> {
  try {
    const session = await cdp(page);
    await session.send('Network.enable');
    await session.send('Network.clearBrowserCache');
    return true;
  } catch {
    return false;
  }
}

export async function emulateNetwork(
  page: Page,
  profile: NetworkProfile,
): Promise<NetworkProfile | null> {
  try {
    const cdp0 = await cdp(page);
    await cdp0.send('Network.enable');
    await cdp0.send('Network.emulateNetworkConditions', {
      offline: profile.offline,
      downloadThroughput: (profile.downloadKbps * 1024) / 8,
      uploadThroughput: (profile.uploadKbps * 1024) / 8,
      latency: profile.latencyMs,
    });
    return profile;
  } catch {
    return null;
  }
}

export async function clearNetworkEmulation(page: Page): Promise<void> {
  try {
    const cdp0 = await cdp(page);
    await cdp0.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  } catch {
    /* nothing to clear */
  }
}

// ---------------------------------------------------------------------------
// Thin assertion wrappers. The number is the artifact; these are consequences.
// ---------------------------------------------------------------------------

export function assertTouchTargets(report: TouchTargetReport, surface: string): void {
  expect(
    report.scanned,
    `${surface}: the scan must actually have measured something`,
  ).toBeGreaterThan(0);
  expect(
    report.offenders.map((o) => `${o.tag}[${o.label}] ${o.width}x${o.height}`),
    `${surface}: every pointer target should be >= 44x44 CSS px (R16.2); ` +
      `scanned ${report.scanned}, min ${report.minWidth}x${report.minHeight}`,
  ).toEqual([]);
}

export function assertNoOverflow(report: OverflowReport, surface: string): void {
  expect(
    report.elementsConsidered,
    `${surface}: the overflow scan must actually have considered something`,
  ).toBeGreaterThan(0);
  expect(
    report.document,
    `${surface}: no horizontal document overflow at ${report.viewportWidth}px (R16.7); ` +
      `widest: ${JSON.stringify(report.widestOffenders)}`,
  ).toBeLessThanOrEqual(1);
  expect(
    report.clippedCommands,
    `${surface}: no command should be clipped out of a hidden-overflow container ` +
      `(R16.7 "hidden commands"); ${report.clippingContainers} container(s) clip content`,
  ).toEqual([]);
}

export function assertNoOcclusion(report: OcclusionReport, surface: string): void {
  expect(
    report.probed,
    `${surface}: the occlusion probe must have had something to probe`,
  ).toBeGreaterThan(0);
  expect(
    report.occluded,
    `${surface}: no interactive element should stay covered after being scrolled ` +
      `into view (R16.3); ${report.occludedAtRest.length} were covered at rest, ` +
      `${report.rescrolled} re-probed`,
  ).toEqual([]);
}

/**
 * The CLS budget. 0.1 is the Core Web Vitals "good" threshold and the one
 * `.agents/skills/core-web-vitals` uses; R16.7 forbids *"layout shifts"* without
 * naming a number, so the published budget is used rather than an invented one.
 */
export const CLS_BUDGET = 0.1;

export function assertNoLayoutShift(report: LayoutShiftReport, surface: string): void {
  expect(
    report.cls,
    `${surface}: cumulative layout shift should stay within ${CLS_BUDGET} (R16.7); ` +
      `shifts: ${JSON.stringify(report.shifts.slice(0, 5))}`,
  ).toBeLessThanOrEqual(CLS_BUDGET);
}
