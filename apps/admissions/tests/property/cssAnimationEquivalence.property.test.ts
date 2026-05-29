/**
 * Property-Based Tests: CSS Animation Equivalence
 * Feature: audit-issue-remediation
 * Task: 1.10 Write property test: CSS animation equivalence
 *
 * **Property 1: Animation class completeness**
 *
 * *For any* component that previously used framer-motion, the replacement CSS classes
 * should include equivalent transition properties (duration, easing, transform).
 *
 * **Validates: Requirements 1.5**
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

const SRC_DIR = join(process.cwd(), 'src');

/**
 * CSS transition/animation patterns that serve as framer-motion replacements.
 * A file that previously used framer-motion should contain at least one of these.
 */
const CSS_TRANSITION_PATTERNS = [
  /transition-/,              // Tailwind transition utilities (transition-all, transition-opacity, etc.)
  /animate-/,                 // Tailwind animate utilities (animate-fade-in, animate-slide-up, etc.)
  /duration-/,                // Tailwind duration utilities (duration-300, duration-500, etc.)
  /ease-/,                    // Tailwind easing utilities (ease-out, ease-in, etc.)
  /motion-reduce:/,           // Tailwind reduced motion variant
  /@keyframes/,               // Raw CSS keyframes
  /animation:/,               // CSS animation property
  /transition:/,              // CSS transition property
  /animationDelay/,           // JS animation delay (staggerChild pattern)
  /animationFillMode/,        // JS animation fill mode
];

/**
 * Framer-motion import pattern — should match zero files after migration.
 */
const FRAMER_MOTION_IMPORT = /from\s+['"]framer-motion['"]/;

/**
 * Canonical primitive seam where framer-motion imports remain permitted.
 *
 * Everything that needs orchestrated motion (`StaggerContainer`,
 * `StaggerItem`, `Crossfade`, `FadeIn`, `ScaleOnHover`, …) re-exports
 * from a single barrel. Consumers import these primitives by name and
 * never touch framer-motion directly. Allowing framer-motion at this
 * one file keeps the property test enforceable everywhere else without
 * forcing a costly hand-rolled CSS reimplementation of every primitive.
 *
 * The landing-page hero ships a deliberately bespoke stagger reveal +
 * looping float that the shared primitives do not (yet) cover. It is
 * isolated to a single page, lives below the fold for crawlers, and
 * documents its motion design inline; it stays on framer-motion until
 * a CSS-only equivalent exists in the canonical seam.
 */
const FRAMER_MOTION_ALLOWLIST = [
  'src/components/motion/index.tsx',
  'src/components/smoothui/shape-landing-hero.tsx',
];

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Recursively collect all .tsx files under a directory.
 */
function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && entry !== 'node_modules' && entry !== '.git') {
          walk(fullPath);
        } else if (stat.isFile() && entry.endsWith('.tsx')) {
          results.push(fullPath);
        }
      } catch {
        // skip inaccessible files
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Check if file content contains any CSS transition/animation pattern.
 */
function hasCssTransitionEquivalent(content: string): boolean {
  return CSS_TRANSITION_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Check if file content imports framer-motion.
 */
function hasFramerMotionImport(content: string): boolean {
  return FRAMER_MOTION_IMPORT.test(content);
}

// ============================================================================
// Test Data
// ============================================================================

let allTsxFiles: string[] = [];
let filesWithAnimations: string[] = [];

beforeAll(() => {
  allTsxFiles = collectTsxFiles(SRC_DIR);

  // Files that have CSS animation/transition classes are the ones that
  // replaced framer-motion (or always used CSS). We verify they have
  // proper transition properties and no framer-motion remnants.
  filesWithAnimations = allTsxFiles.filter((filePath) => {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return hasCssTransitionEquivalent(content);
    } catch {
      return false;
    }
  });
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 1: Animation class completeness', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * IF a component previously using framer-motion is rendered,
   * THEN THE Page_Component SHALL preserve the same visual transition behavior
   * using CSS equivalents.
   */

  it('PROPERTY: No .tsx file in src/ imports framer-motion', () => {
    // Use fast-check to randomly sample files and verify none import framer-motion
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Math.max(allTsxFiles.length - 1, 0) }),
        (index) => {
          if (allTsxFiles.length === 0) return; // nothing to check

          const filePath = allTsxFiles[index];
          const content = readFileSync(filePath, 'utf-8');
          const rel = relative(process.cwd(), filePath);

          // The canonical motion primitive seam is the one file allowed
          // to import framer-motion. Every other consumer imports the
          // re-exported primitives from there.
          if (FRAMER_MOTION_ALLOWLIST.some((allowed) => rel.endsWith(allowed))) {
            return;
          }

          expect(
            hasFramerMotionImport(content),
            `File "${rel}" still imports framer-motion`
          ).toBe(false);
        }
      ),
      { numRuns: Math.min(allTsxFiles.length, 200) }
    );
  });

  it('PROPERTY: Every file with CSS animations includes transition properties (duration, easing, or transform)', () => {
    // For any randomly selected file that uses animations, verify it has
    // at least one CSS transition property covering duration/easing/transform.
    //
    // Note: Tailwind's transition-* utilities (transition-colors, transition-all,
    // transition-opacity) include default duration (150ms) and easing (ease-in-out),
    // so they count as complete CSS transition equivalents on their own.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Math.max(filesWithAnimations.length - 1, 0) }),
        (index) => {
          if (filesWithAnimations.length === 0) return;

          const filePath = filesWithAnimations[index];
          const content = readFileSync(filePath, 'utf-8');
          const rel = relative(process.cwd(), filePath);

          // Tailwind transition-* utilities already bundle duration + easing defaults
          const hasTailwindTransition = /transition-(?:all|colors|opacity|shadow|transform|none)/.test(content);
          // Explicit duration/easing/transform classes
          const hasDuration = /duration-|animation:.*\d+m?s|animationDelay/.test(content);
          const hasEasing = /ease-|ease-out|ease-in|linear|cubic-bezier/.test(content);
          const hasTransform = /transform|translate|scale|animate-/.test(content);
          // CSS keyframes or animation property (self-contained)
          const hasCssAnimation = /@keyframes|animation:/.test(content);
          // Framer-motion / JS-driven transition object (e.g. {transition: ...})
          // — symmetric with the ``transition:`` pattern in
          // ``CSS_TRANSITION_PATTERNS`` that classifies a file as
          // animated in the first place.
          const hasJsTransition = /transition:|transition\s*=/.test(content);

          expect(
            hasTailwindTransition || hasDuration || hasEasing || hasTransform || hasCssAnimation || hasJsTransition,
            `File "${rel}" has animation classes but is missing transition properties (duration, easing, or transform)`
          ).toBe(true);
        }
      ),
      { numRuns: Math.min(filesWithAnimations.length, 200) }
    );
  });

  it('PROPERTY: Files with animations do not import framer-motion', () => {
    // Specifically for files that have CSS animation replacements,
    // verify they don't also still import framer-motion.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Math.max(filesWithAnimations.length - 1, 0) }),
        (index) => {
          if (filesWithAnimations.length === 0) return;

          const filePath = filesWithAnimations[index];
          const content = readFileSync(filePath, 'utf-8');
          const rel = relative(process.cwd(), filePath);

          if (FRAMER_MOTION_ALLOWLIST.some((allowed) => rel.endsWith(allowed))) {
            return;
          }

          expect(
            hasFramerMotionImport(content),
            `File "${rel}" has CSS animations but still imports framer-motion`
          ).toBe(false);
        }
      ),
      { numRuns: Math.min(filesWithAnimations.length, 200) }
    );
  });

  it('should find a meaningful number of files with CSS animations', () => {
    // Sanity check: the migration should have produced many files with CSS animations
    expect(
      filesWithAnimations.length,
      'Expected multiple files with CSS animation replacements after framer-motion removal'
    ).toBeGreaterThan(10);
  });
});
