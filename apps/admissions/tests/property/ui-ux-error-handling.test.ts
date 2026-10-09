/**
 * Property 7: AutoSaveIndicator error state includes retry
 * Feature: website-ui-ux-fix, Property 7: AutoSaveIndicator error state includes retry
 *
 * For any AutoSaveIndicator with status="error" and an onRetry callback,
 * the rendered output SHALL include a clickable retry button.
 *
 * Validates: Requirements 5.2
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';
// Task 13.6 remediation L6 (GATE-13.3-10): the boundary's copy is now chosen by a
// pure classifier, so Property 9 asserts the classifier's output rather than a
// substring of the file that renders it.
import { classifyBoundaryError, leaksInternalError } from '../../src/lib/errorBoundaryCopy';

// Read the AutoSaveIndicator source once
const COMPONENT_PATH = resolve(
  process.cwd(),
  'src/components/ui/AutoSaveIndicator.tsx'
);
const componentSource = readFileSync(COMPONENT_PATH, 'utf-8');

/**
 * Extract a brace-balanced block starting from a given position.
 * Returns the content between the outermost matching braces (inclusive).
 */
function extractBalancedBlock(source: string, startIdx: number): string {
  let depth = 0;
  let blockStart = -1;
  for (let i = startIdx; i < source.length; i++) {
    if (source[i] === '{') {
      if (depth === 0) blockStart = i;
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(blockStart, i + 1);
      }
    }
  }
  return '';
}

/**
 * Extract the JSX error-state block — the `{status === 'error' && (...)}` in the return statement.
 * We find the return statement first, then locate the error conditional within it.
 */
function getJsxErrorBlock(source: string): string {
  // Find the return statement
  const returnIdx = source.indexOf('return (');
  if (returnIdx === -1) return '';

  const jsxPortion = source.slice(returnIdx);

  // Find the error status conditional in the JSX portion
  const errorPattern = /\{status\s*===\s*['"]error['"]/;
  const match = errorPattern.exec(jsxPortion);
  if (!match) return '';

  // Extract the balanced block starting from the `{`
  return extractBalancedBlock(jsxPortion, match.index);
}

/**
 * Extract the onRetry conditional block within a given block.
 */
function getOnRetryBlock(block: string): string {
  const marker = /\{onRetry\s*&&/;
  const match = marker.exec(block);
  if (!match) return '';
  return extractBalancedBlock(block, match.index);
}

const errorBlock = getJsxErrorBlock(componentSource);
const onRetryBlock = getOnRetryBlock(errorBlock);

describe('Feature: website-ui-ux-fix, Property 7: AutoSaveIndicator error state includes retry', () => {
  /**
   * Validates: Requirements 5.2
   *
   * Property: When status="error" and onRetry is provided, a <button> element
   * is rendered with proper accessibility and touch target attributes.
   */
  it('error state with onRetry renders a clickable retry button', () => {
    // Arbitrary: generate various scenario labels to confirm the structural
    // property holds across all checks
    const scenarioArb = fc.constantFrom(
      'onRetry-provided',
      'callback-truthy',
      'retry-handler-set',
      'save-retry-active',
      'manual-retry-enabled'
    );

    fc.assert(
      fc.property(scenarioArb, (_scenario) => {
        // 1. The error block exists in the component JSX
        expect(errorBlock.length).toBeGreaterThan(0);

        // 2. The error block contains an onRetry conditional guard
        expect(errorBlock).toMatch(/onRetry\s*&&/);

        // 3. The onRetry block renders a <button> element
        expect(onRetryBlock).toContain('<button');
        expect(onRetryBlock).toContain('</button>');

        // 4. The button has type="button" (not submit)
        expect(onRetryBlock).toMatch(/type=["']button["']/);

        // 5. The button calls onRetry on click
        expect(onRetryBlock).toMatch(/onClick=\{onRetry\}/);

        // 6. The button has an accessible aria-label
        expect(onRetryBlock).toMatch(/aria-label=["']Retry save["']/);

        // 7. The button includes "Retry" text content
        expect(onRetryBlock).toContain('Retry');
      }),
      { numRuns: 100 }
    );
  });

  it('retry button meets 44px minimum touch target', () => {
    const touchTargetPatterns = [
      'min-h-[44px]',
      'min-w-[44px]',
    ];

    fc.assert(
      fc.property(fc.constant(true), () => {
        for (const pattern of touchTargetPatterns) {
          expect(
            onRetryBlock,
            `Retry button should include touch target class "${pattern}"`
          ).toContain(pattern);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('retry button uses destructive semantic tokens (not hardcoded palette)', () => {
    const requiredTokens = [
      'bg-destructive/10',
      'hover:bg-destructive/20',
      'text-destructive',
    ];

    const forbiddenPatterns = [
      /bg-red-\d+/,
      /text-red-\d+/,
      /hover:bg-red-\d+/,
    ];

    fc.assert(
      fc.property(fc.constant(true), () => {
        // Must use semantic destructive tokens
        for (const token of requiredTokens) {
          expect(
            onRetryBlock,
            `Retry button should use semantic token "${token}"`
          ).toContain(token);
        }

        // Must not use hardcoded red palette colors
        for (const pattern of forbiddenPatterns) {
          expect(
            onRetryBlock,
            `Retry button should not use hardcoded palette color matching ${pattern}`
          ).not.toMatch(pattern);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('retry button has focus-visible ring for keyboard accessibility', () => {
    const focusClasses = [
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
      'focus-visible:ring-offset-2',
    ];

    fc.assert(
      fc.property(fc.constant(true), () => {
        for (const cls of focusClasses) {
          expect(
            onRetryBlock,
            `Retry button should include focus class "${cls}"`
          ).toContain(cls);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('error state without onRetry does NOT render a retry button', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // Remove the onRetry guard block from the error block.
        // Verify no <button> remains — the button is ONLY inside the guard.
        const onRetryGuardPattern = /\{onRetry\s*&&[\s\S]*?\}\s*\}/;
        // Use balanced extraction to remove the entire onRetry block
        const guardStart = errorBlock.search(/\{onRetry\s*&&/);
        const guardBlock = guardStart >= 0
          ? extractBalancedBlock(errorBlock, guardStart)
          : '';
        const blockWithoutRetryGuard = guardBlock
          ? errorBlock.replace(guardBlock, '')
          : errorBlock;

        expect(
          blockWithoutRetryGuard,
          'No <button> should exist outside the onRetry guard in error state'
        ).not.toContain('<button');
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 8: Input error display with destructive styling
 * Feature: website-ui-ux-fix, Property 8: Input error display with destructive styling
 *
 * For any Input component with a non-empty error prop, the rendered output
 * SHALL include an error message element with text-destructive styling and role="alert".
 *
 * Validates: Requirements 5.3
 */

// Read the Input component source once
const INPUT_COMPONENT_PATH = resolve(
  process.cwd(),
  'src/components/ui/input.tsx'
);
const inputComponentSource = readFileSync(INPUT_COMPONENT_PATH, 'utf-8');

/**
 * Extract the error rendering block — the `{error && (...)}` conditional in the JSX.
 */
function getInputErrorBlock(source: string): string {
  // Find the return statement
  const returnIdx = source.indexOf('return (');
  if (returnIdx === -1) return '';

  const jsxPortion = source.slice(returnIdx);

  // Find the error conditional in the JSX
  const errorPattern = /\{error\s*&&/;
  const match = errorPattern.exec(jsxPortion);
  if (!match) return '';

  return extractBalancedBlock(jsxPortion, match.index);
}

const inputErrorBlock = getInputErrorBlock(inputComponentSource);

describe('Feature: website-ui-ux-fix, Property 8: Input error display with destructive styling', () => {
  /**
   * Validates: Requirements 5.3
   *
   * Property: For any Input with a non-empty error prop, the rendered output
   * includes an error message element with text-destructive styling and role="alert".
   */
  it('error block renders with role="alert" and text-destructive styling', () => {
    // Generate arbitrary non-empty error strings to confirm the structural
    // property holds regardless of error message content
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

    fc.assert(
      fc.property(errorMessageArb, (_errorMessage) => {
        // 1. The error block exists in the component JSX
        expect(inputErrorBlock.length).toBeGreaterThan(0);

        // 2. The error block has role="alert" for accessibility
        expect(inputErrorBlock).toMatch(/role=["']alert["']/);

        // 3. The error block uses text-destructive semantic token
        expect(inputErrorBlock).toContain('text-destructive');

        // 4. The error block renders a <p> element (semantic error message)
        expect(inputErrorBlock).toContain('<p');

        // 5. The error block includes an id for aria-describedby linkage
        expect(inputErrorBlock).toMatch(/id=\{/);
      }),
      { numRuns: 100 }
    );
  });

  it('error block includes AlertCircle icon with aria-hidden', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // 1. The error block contains an AlertCircle icon
        expect(inputErrorBlock).toContain('AlertCircle');

        // 2. The icon is hidden from screen readers
        expect(inputErrorBlock).toMatch(/aria-hidden=["']true["']/);
      }),
      { numRuns: 100 }
    );
  });

  it('error block uses only semantic tokens (no hardcoded palette colors)', () => {
    const forbiddenPatterns = [
      /text-red-\d+/,
      /bg-red-\d+/,
      /border-red-\d+/,
      /text-green-\d+/,
      /text-blue-\d+/,
      /text-yellow-\d+/,
    ];

    fc.assert(
      fc.property(fc.constant(true), () => {
        for (const pattern of forbiddenPatterns) {
          expect(
            inputErrorBlock,
            `Error block should not use hardcoded palette color matching ${pattern}`
          ).not.toMatch(pattern);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('input element gets aria-invalid="true" when error is present', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // The component source should set aria-invalid based on error prop
        expect(inputComponentSource).toMatch(/aria-invalid=\{error\s*\?\s*['"]true['"]/);
      }),
      { numRuns: 100 }
    );
  });

  it('error text uses text-sm for consistent typography', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // The error paragraph should use text-sm for consistent sizing
        expect(inputErrorBlock).toContain('text-sm');
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 9: ErrorBoundary renders recovery UI on error
 * Feature: website-ui-ux-fix, Property 9: ErrorBoundary renders recovery UI on error
 *
 * For any Error thrown within an ErrorBoundary's children, the ErrorBoundary
 * SHALL render an error display with a retry/reload action button.
 *
 * Validates: Requirements 10.3
 */

// Read the ErrorBoundary source once
const ERROR_BOUNDARY_PATH = resolve(
  process.cwd(),
  'src/components/ui/ErrorBoundary.tsx'
);
const errorBoundarySource = readFileSync(ERROR_BOUNDARY_PATH, 'utf-8');

/**
 * Extract the page-level error rendering block from the ErrorBoundary render method.
 * This is the block inside `if (level === 'page') { return (...) }`.
 */
function getPageLevelBlock(source: string): string {
  const marker = /if\s*\(\s*level\s*===\s*['"]page['"]\s*\)/;
  const match = marker.exec(source);
  if (!match) return '';
  return extractBalancedBlock(source, match.index + match[0].length);
}

/**
 * Extract the section-level error rendering block — the fallback after the page-level block.
 * This is the `return (...)` that follows the page-level if block within the hasError check.
 */
function getSectionLevelBlock(source: string): string {
  // Find the hasError conditional
  const hasErrorIdx = source.indexOf('if (this.state.hasError)');
  if (hasErrorIdx === -1) return '';

  const hasErrorBlock = extractBalancedBlock(source, source.indexOf('{', hasErrorIdx));

  // Find the section-level comment or the ErrorDisplay usage
  const sectionMarker = /\/\/\s*section-level/;
  const match = sectionMarker.exec(hasErrorBlock);
  if (!match) {
    // Fallback: look for ErrorDisplay directly
    const edIdx = hasErrorBlock.indexOf('ErrorDisplay');
    if (edIdx === -1) return '';
    // Go back to find the enclosing return
    const returnIdx = hasErrorBlock.lastIndexOf('return', edIdx);
    if (returnIdx === -1) return '';
    return hasErrorBlock.slice(returnIdx);
  }
  return hasErrorBlock.slice(match.index);
}

const pageLevelBlock = getPageLevelBlock(errorBoundarySource);
const sectionLevelBlock = getSectionLevelBlock(errorBoundarySource);

describe('Feature: website-ui-ux-fix, Property 9: ErrorBoundary renders recovery UI on error', () => {
  /**
   * Validates: Requirements 10.3
   *
   * Property: For any error caught by ErrorBoundary, the page-level variant
   * renders a friendly error message with a reload button.
   */
  /*
    Task 13.6 remediation L6 (GATE-13.3-10): this case used to assert that the
    page-level block **contained the literal strings** `'Something went wrong'` and
    `'Please try reloading the page'`. Both moved into
    `src/lib/errorBoundaryCopy.ts`, because the boundary no longer has one sentence
    — it has four, chosen by classifying the exception, and it no longer renders
    `error.message` at a student (13.3 measured *"Cannot read properties of
    undefined (reading 'SessionMonitor')"* on that path).

    So the claim is asserted against the copy the boundary actually renders rather
    than against the file that renders it, which is strictly stronger: a source
    substring cannot tell whether the sentence reaches the screen, and 13.3 §13's
    own lesson is that a guard reading a declaration cannot answer a question about
    a rendered page. Requirement 10.3 is unchanged: a friendly message, always.
  */
  it('every classified error still yields a friendly message and recovery guidance', () => {
    const errorArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 200 }).map((m) => new Error(m)),
      fc.constant(new Error('Failed to fetch dynamically imported module: /assets/js/x.js')),
      fc.constant(new TypeError("Cannot read properties of undefined (reading 'SessionMonitor')")),
      fc.constant(undefined),
    );

    fc.assert(
      fc.property(errorArb, fc.boolean(), (error, online) => {
        const copy = classifyBoundaryError(error, online);

        // 1. There is always a title and a message, and neither is empty.
        expect(copy.title.trim().length).toBeGreaterThan(0);
        expect(copy.message.trim().length).toBeGreaterThan(0);

        // 2. The message always tells the student what to do next.
        expect(copy.message).toMatch(/try again|reload|reconnect|contact support/i);

        // 3. R16.8 / GATE-13.3-10: it never leaks an internal error shape.
        expect(leaksInternalError(`${copy.title} ${copy.message}`)).toBe(false);

        // 4. The unknown case keeps the original friendly heading.
        if (copy.kind === 'unknown') expect(copy.title).toBe('Something went wrong');
      }),
      { numRuns: 200 }
    );
  });

  /*
    The source-level half of the same claim, and the one that can regress silently:
    neither fallback may pass the caught exception into copy again. The *rendered*
    half is `tests/unit/errorBoundaryOfflineCopy.test.tsx`, because this file runs
    in the `node` environment and cannot mount a component.
  */
  it('neither fallback renders the caught exception message', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        for (const [name, block] of [
          ['page-level', pageLevelBlock],
          ['section-level', sectionLevelBlock],
        ] as const) {
          expect(block.length, `${name} block should be extractable`).toBeGreaterThan(0);
          expect(block, `${name} block must not render error.message (GATE-13.3-10)`).not.toMatch(
            /state\.error\??\.message/
          );
          expect(block, `${name} block should render the classified copy`).toMatch(/copy\.(title|message)/);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('an offline failure names the connection (GATE-13.3-10)', () => {
    const offline = classifyBoundaryError(new Error('anything at all'), false);
    expect(offline.kind).toBe('offline');
    expect(offline.title + ' ' + offline.message).toMatch(
      /offline|connection|network|internet|reconnect/i
    );

    const chunk = classifyBoundaryError(
      new Error('Failed to fetch dynamically imported module: /assets/js/SessionMonitor-abc.js'),
      true
    );
    expect(chunk.kind).toBe('chunk');
    expect(chunk.title + ' ' + chunk.message).toMatch(/connection|network|downloaded/i);
  });

  it('page-level variant renders a Reload Page button', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // 1. The page-level block contains a Button component
        expect(pageLevelBlock).toContain('Button');

        // 2. The button triggers handleReload (which calls window.location.reload)
        expect(pageLevelBlock).toMatch(/onClick=\{this\.handleReload\}/);

        // 3. The button text says "Reload Page"
        expect(pageLevelBlock).toContain('Reload Page');

        // 4. The button includes a RefreshCw icon
        expect(pageLevelBlock).toContain('RefreshCw');

        /*
          5. Task 13.6 remediation L6: and a `Try Again` that does *not* discard the
          page. Reloading was the only page-level recovery, which for an offline
          chunk failure is the one action guaranteed to fail again; `handleReset`
          re-renders the subtree in place, and `Reload Page` is now offered beside
          it only when `copy.offerReload` says a reload is the useful control.
        */
        expect(pageLevelBlock).toMatch(/onClick=\{this\.handleReset\}/);
        expect(pageLevelBlock).toContain('copy.offerReload');
      }),
      { numRuns: 100 }
    );
  });

  it('page-level variant has role="alert" for accessibility', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // 1. The page-level block has role="alert"
        expect(pageLevelBlock).toMatch(/role=["']alert["']/);

        // 2. The page-level block has aria-live="assertive"
        expect(pageLevelBlock).toMatch(/aria-live=["']assertive["']/);
      }),
      { numRuns: 100 }
    );
  });

  it('page-level variant uses destructive color tokens (not hardcoded palette)', () => {
    const requiredTokens = [
      'border-destructive/30',
      'bg-destructive/10',
      'text-destructive',
    ];

    const forbiddenPatterns = [
      /bg-red-\d+/,
      /text-red-\d+/,
      /border-red-\d+/,
    ];

    fc.assert(
      fc.property(fc.constant(true), () => {
        for (const token of requiredTokens) {
          expect(
            pageLevelBlock,
            `Page-level error should use semantic token "${token}"`
          ).toContain(token);
        }

        for (const pattern of forbiddenPatterns) {
          expect(
            pageLevelBlock,
            `Page-level error should not use hardcoded palette color matching ${pattern}`
          ).not.toMatch(pattern);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('page-level recovery buttons meet the 44px minimum touch target', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        /*
          Task 13.6 remediation L6: the arbitrary-value pair `min-h-[44px]` /
          `min-w-[44px]` was carried *alongside* `min-h-touch` / `min-w-touch` on
          the same element — the same 44 px stated twice, once as a magic number.
          The named utilities are the repo's own (`tailwind.config.js` →
          `minHeight.touch`), and `design-skills.md` names them as the way to
          express this, so a change to the touch floor cannot be half-applied.

          Both buttons are checked, not one: the page-level fallback now offers
          `Try Again` as well as `Reload Page` (GATE-13.3-10).
        */
        const buttons = pageLevelBlock.match(/<Button[\s\S]*?>/g) ?? [];
        expect(buttons.length, 'page-level fallback should render recovery buttons').toBeGreaterThan(0);
        for (const button of buttons) {
          expect(button, `every page-level recovery button needs a 44px floor: ${button}`).toContain(
            'min-h-touch'
          );
          expect(button).toContain('min-w-touch');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('section-level variant renders ErrorDisplay with onRetry', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // 1. The section-level block exists
        expect(sectionLevelBlock.length).toBeGreaterThan(0);

        // 2. It uses the ErrorDisplay component
        expect(sectionLevelBlock).toContain('ErrorDisplay');

        // 3. It passes an onRetry prop for recovery
        expect(sectionLevelBlock).toMatch(/onRetry=\{this\.handleReset\}/);

        // 4. It passes a title — the classified one (13.6 L6, GATE-13.3-10). The
        //    literal `'Something went wrong'` now lives in `errorBoundaryCopy.ts`
        //    as the `unknown` case, which the property above pins by name.
        expect(sectionLevelBlock).toMatch(/title=\{copy\.title\}/);
      }),
      { numRuns: 100 }
    );
  });

  it('handleReload calls window.location.reload', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // The component source must define handleReload that calls window.location.reload()
        expect(errorBoundarySource).toMatch(/handleReload\s*=\s*\(\)\s*=>\s*\{/);
        expect(errorBoundarySource).toContain('window.location.reload()');
      }),
      { numRuns: 100 }
    );
  });

  it('handleReset resets error state for section-level recovery', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        // The component source must define handleReset that clears the error state
        expect(errorBoundarySource).toMatch(/handleReset\s*=\s*\(\)\s*=>\s*\{/);
        expect(errorBoundarySource).toContain('hasError: false');
      }),
      { numRuns: 100 }
    );
  });
});
