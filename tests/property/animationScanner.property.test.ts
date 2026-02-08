/**
 * Property-Based Tests: Animation Scanner - Heavy Animation Flagging
 * Feature: frontend-backend-forensic-audit
 * Task: 13.2 Write property test for animation flagging
 * 
 * **Property 20: Heavy Animation Flagging**
 * 
 * *For any* animation using heavy libraries (framer-motion) or complex CSS animations,
 * the Performance Auditor SHALL flag it for removal or optimization.
 * 
 * **Validates: Requirements 7.2**
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  scanFileForAnimations,
  type ExtendedAnimationUsage,
} from '../../scripts/audit/performance/animationScanner';
import type { AnimationLibrary } from '../../scripts/audit/types';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Reduced for faster execution with file I/O.
 */
const NUM_RUNS = 50;

/**
 * Base temporary directory for test fixtures - relative to project root
 */
const TEST_FIXTURES_DIR = '.test-fixtures-animation';

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid framer-motion component names
 */
const framerMotionComponentArb = fc.constantFrom(
  'div', 'span', 'button', 'a', 'ul', 'li', 'p', 'h1', 'h2', 'section', 'article'
);

/**
 * Valid framer-motion hooks
 */
const framerMotionHookArb = fc.constantFrom(
  'useAnimation', 'useMotionValue', 'useSpring', 'useTransform'
);

/**
 * Valid CSS animation names
 */
const cssAnimationNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,15}$/);

/**
 * Valid animation durations
 */
const animationDurationArb = fc.oneof(
  fc.integer({ min: 100, max: 5000 }).map(ms => `${ms}ms`),
  fc.integer({ min: 1, max: 50 }).map(tenths => `${(tenths / 10).toFixed(1)}s`)
);

/**
 * Valid easing functions
 */
const easingFunctionArb = fc.constantFrom(
  'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'
);

// ============================================================================
// Code Generators
// ============================================================================

/**
 * Generate framer-motion component usage
 */
function generateFramerMotionComponent(element: string): string {
  return `
import { motion } from 'framer-motion';

export function AnimatedComponent() {
  return (
    <motion.${element}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      Content
    </motion.${element}>
  );
}
`;
}

/**
 * Generate framer-motion hook usage
 */
function generateFramerMotionHook(hook: string): string {
  return `
import { ${hook} } from 'framer-motion';

export function AnimatedComponent() {
  const animation = ${hook}();
  return <div>Content</div>;
}
`;
}

/**
 * Generate AnimatePresence usage
 */
function generateAnimatePresence(): string {
  return `
import { AnimatePresence, motion } from 'framer-motion';

export function AnimatedList({ items }) {
  return (
    <AnimatePresence>
      {items.map(item => (
        <motion.div key={item.id} exit={{ opacity: 0 }}>
          {item.name}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
`;
}

/**
 * Generate CSS keyframes animation
 */
function generateCSSKeyframes(name: string, steps: number): string {
  const percentages = Array.from({ length: steps }, (_, i) => 
    Math.round((i / (steps - 1)) * 100)
  );
  const keyframeSteps = percentages.map(p => 
    `  ${p}% { transform: translateX(${p}px); }`
  ).join('\n');
  
  return `
@keyframes ${name} {
${keyframeSteps}
}

.animated-element {
  animation: ${name} 1s ease-in-out infinite;
}
`;
}

/**
 * Generate CSS animation property with infinite
 */
function generateCSSAnimationProperty(name: string, duration: string, easing: string): string {
  return `
.animated-element {
  animation: ${name} ${duration} ${easing} infinite alternate;
}
`;
}

/**
 * Generate Tailwind animate class usage
 */
function generateTailwindAnimate(animateClass: string): string {
  return `
export function SpinnerComponent() {
  return <div className="${animateClass}">Loading...</div>;
}
`;
}

/**
 * Generate other animation library import (GSAP, react-spring, etc.)
 */
function generateOtherAnimationLibrary(library: string): string {
  const imports: Record<string, string> = {
    'gsap': `import gsap from 'gsap';

export function GsapComponent() {
  return <div>GSAP Animation</div>;
}`,
    'react-spring': `import { useSpring, animated } from '@react-spring/web';

export function SpringComponent() {
  return <div>Spring Animation</div>;
}`,
    'animejs': `import anime from 'animejs';

export function AnimeComponent() {
  return <div>Anime Animation</div>;
}`,
    'lottie': `import Lottie from 'lottie-react';

export function LottieComponent() {
  return <div>Lottie Animation</div>;
}`,
  };
  return imports[library] || '';
}

// ============================================================================
// Test Helpers
// ============================================================================

let testCounter = 0;

/**
 * Create a unique test file path (relative to project root)
 */
function createTestFilePath(filename: string): string {
  const uniqueId = `${Date.now()}-${testCounter++}`;
  return join(TEST_FIXTURES_DIR, `test-${uniqueId}`, filename);
}

/**
 * Write a test file and return its relative path
 */
async function writeTestFile(relativePath: string, content: string): Promise<string> {
  const fullPath = join(process.cwd(), relativePath);
  const dir = join(fullPath, '..');
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
  return relativePath;
}

/**
 * Clean up a test file
 */
async function cleanupTestFile(relativePath: string): Promise<void> {
  try {
    const fullPath = join(process.cwd(), relativePath);
    const dir = join(fullPath, '..');
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Global Setup/Teardown
// ============================================================================

beforeAll(async () => {
  // Ensure base directory exists
  await mkdir(join(process.cwd(), TEST_FIXTURES_DIR), { recursive: true });
});

afterAll(async () => {
  // Clean up all test fixtures
  try {
    await rm(join(process.cwd(), TEST_FIXTURES_DIR), { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 20: Heavy Animation Flagging', () => {
  /**
   * **Validates: Requirements 7.2**
   * 
   * IF heavy animations exist THEN the Audit_System SHALL flag them for removal
   */

  // ==========================================================================
  // Framer-Motion Import Detection
  // ==========================================================================

  describe('All framer-motion imports are flagged as heavy', () => {
    it('PROPERTY: Every framer-motion import is detected and flagged as heavy', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('FramerComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const framerAnimations = animations.filter(
                a => a.library === 'framer-motion'
              );

              // Should detect framer-motion usage
              expect(framerAnimations.length).toBeGreaterThan(0);

              // All framer-motion animations should be flagged as heavy
              for (const animation of framerAnimations) {
                expect(animation.isHeavy).toBe(true);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: framer-motion hooks are detected and flagged as heavy', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionHookArb,
          async (hook) => {
            const content = generateFramerMotionHook(hook);
            const filePath = createTestFilePath('HookComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const hookAnimations = animations.filter(
                a => a.animationType === 'framer-motion-hook' ||
                     a.animationType === 'framer-motion-import'
              );

              // Should detect framer-motion hook usage
              expect(hookAnimations.length).toBeGreaterThan(0);

              // All should be flagged as heavy
              for (const animation of hookAnimations) {
                expect(animation.isHeavy).toBe(true);
                expect(animation.library).toBe('framer-motion');
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: AnimatePresence is detected and flagged as heavy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const content = generateAnimatePresence();
            const filePath = createTestFilePath('AnimatePresenceComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const presenceAnimations = animations.filter(
                a => a.library === 'framer-motion'
              );

              // Should detect AnimatePresence
              expect(presenceAnimations.length).toBeGreaterThan(0);

              // All should be flagged as heavy
              for (const animation of presenceAnimations) {
                expect(animation.isHeavy).toBe(true);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Framer-Motion Component Detection
  // ==========================================================================

  describe('All framer-motion components (motion.*) are flagged as heavy', () => {
    it('PROPERTY: motion.* components are detected with correct animation type', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('MotionComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const motionComponents = animations.filter(
                a => a.animationType === 'framer-motion-component'
              );

              // Should detect motion.* component
              expect(motionComponents.length).toBeGreaterThan(0);

              // All motion components should be heavy
              for (const animation of motionComponents) {
                expect(animation.isHeavy).toBe(true);
                expect(animation.library).toBe('framer-motion');
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Complex CSS Animation Detection
  // ==========================================================================

  describe('Complex CSS animations are identified', () => {
    it('PROPERTY: CSS @keyframes are detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          cssAnimationNameArb,
          fc.integer({ min: 2, max: 10 }),
          async (name, steps) => {
            const content = generateCSSKeyframes(name, steps);
            const filePath = createTestFilePath('animations.css');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const keyframeAnimations = animations.filter(
                a => a.animationType === 'css-keyframes'
              );

              // Should detect keyframes
              expect(keyframeAnimations.length).toBeGreaterThan(0);

              // All should have css library
              for (const animation of keyframeAnimations) {
                expect(animation.library).toBe('css');
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: CSS animations with infinite are detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          cssAnimationNameArb,
          animationDurationArb,
          easingFunctionArb,
          async (name, duration, easing) => {
            const content = generateCSSAnimationProperty(name, duration, easing);
            const filePath = createTestFilePath('infinite-animation.css');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const cssAnimations = animations.filter(
                a => a.library === 'css' && a.animationType === 'css-animation-property'
              );

              // Should detect CSS animation property with infinite
              expect(cssAnimations.length).toBeGreaterThan(0);

              // Infinite animations should be flagged as heavy
              for (const animation of cssAnimations) {
                expect(animation.isHeavy).toBe(true);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Animation Required Fields
  // ==========================================================================

  describe('Each animation has required fields (filePath, library, isHeavy, recommendation)', () => {
    it('PROPERTY: Every AnimationUsage has filePath (non-empty string)', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('FieldsComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);

              for (const animation of animations) {
                expect(animation.filePath).toBeDefined();
                expect(typeof animation.filePath).toBe('string');
                expect(animation.filePath.trim().length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every AnimationUsage has valid library type', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('LibraryComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              const validLibraries: AnimationLibrary[] = ['framer-motion', 'css', 'custom'];

              for (const animation of animations) {
                expect(animation.library).toBeDefined();
                expect(validLibraries).toContain(animation.library);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every AnimationUsage has isHeavy (boolean)', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('HeavyComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);

              for (const animation of animations) {
                expect(animation.isHeavy).toBeDefined();
                expect(typeof animation.isHeavy).toBe('boolean');
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every AnimationUsage has recommendation (non-empty string)', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('RecommendationComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);

              for (const animation of animations) {
                expect(animation.recommendation).toBeDefined();
                expect(typeof animation.recommendation).toBe('string');
                expect(animation.recommendation.trim().length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Every ExtendedAnimationUsage has lineNumber (positive integer)', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('LineNumberComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);

              for (const animation of animations) {
                expect(animation.lineNumber).toBeDefined();
                expect(typeof animation.lineNumber).toBe('number');
                expect(Number.isInteger(animation.lineNumber)).toBe(true);
                expect(animation.lineNumber).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Other Animation Libraries
  // ==========================================================================

  describe('Other animation libraries are detected and flagged', () => {
    it('PROPERTY: GSAP imports are detected and flagged as heavy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant('gsap'),
          async (library) => {
            const content = generateOtherAnimationLibrary(library);
            const filePath = createTestFilePath('GsapComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const gsapAnimations = animations.filter(
                a => a.animationType === 'gsap-import'
              );

              expect(gsapAnimations.length).toBeGreaterThan(0);
              for (const animation of gsapAnimations) {
                expect(animation.isHeavy).toBe(true);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: react-spring imports are detected and flagged as heavy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant('react-spring'),
          async (library) => {
            const content = generateOtherAnimationLibrary(library);
            const filePath = createTestFilePath('SpringComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const springAnimations = animations.filter(
                a => a.animationType === 'react-spring-import'
              );

              expect(springAnimations.length).toBeGreaterThan(0);
              for (const animation of springAnimations) {
                expect(animation.isHeavy).toBe(true);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Lottie imports are detected and flagged as heavy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant('lottie'),
          async (library) => {
            const content = generateOtherAnimationLibrary(library);
            const filePath = createTestFilePath('LottieComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const lottieAnimations = animations.filter(
                a => a.animationType === 'lottie-import'
              );

              expect(lottieAnimations.length).toBeGreaterThan(0);
              for (const animation of lottieAnimations) {
                expect(animation.isHeavy).toBe(true);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Tailwind Animations (Lightweight)
  // ==========================================================================

  describe('Tailwind animations are handled correctly', () => {
    it('PROPERTY: Tailwind animate-* classes are detected but not flagged as heavy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('animate-spin', 'animate-ping', 'animate-pulse', 'animate-bounce'),
          async (animateClass) => {
            const content = generateTailwindAnimate(animateClass);
            const filePath = createTestFilePath('TailwindComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const tailwindAnimations = animations.filter(
                a => a.codeSnippet?.includes(animateClass)
              );

              // Tailwind animations should be detected
              expect(tailwindAnimations.length).toBeGreaterThan(0);

              // Tailwind animations should NOT be heavy
              for (const animation of tailwindAnimations) {
                expect(animation.isHeavy).toBe(false);
                expect(animation.library).toBe('css');
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Empty/No Animation Cases
  // ==========================================================================

  describe('Empty and no-animation cases are handled', () => {
    it('PROPERTY: File without animations returns empty array', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const content = `
export function PlainComponent() {
  return <div>No animations here</div>;
}
`;
            const filePath = createTestFilePath('PlainComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);

              expect(animations.length).toBe(0);
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('PROPERTY: Non-existent file returns empty array', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const filePath = createTestFilePath('NonExistent.tsx');
            // Don't create the file
            const animations = scanFileForAnimations(filePath);

            expect(animations.length).toBe(0);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ==========================================================================
  // Animation Type Classification
  // ==========================================================================

  describe('Animation types are correctly classified', () => {
    it('PROPERTY: framer-motion imports have correct animationType', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('TypeClassComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const framerAnimations = animations.filter(
                a => a.library === 'framer-motion'
              );

              for (const animation of framerAnimations) {
                expect(animation.animationType).toMatch(/^framer-motion-/);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: CSS animations have correct animationType', async () => {
      await fc.assert(
        fc.asyncProperty(
          cssAnimationNameArb,
          fc.integer({ min: 2, max: 5 }),
          async (name, steps) => {
            const content = generateCSSKeyframes(name, steps);
            const filePath = createTestFilePath('CssTypeComponent.css');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);
              
              const cssAnimations = animations.filter(
                a => a.library === 'css'
              );

              for (const animation of cssAnimations) {
                expect(animation.animationType).toMatch(/^css-/);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Code Snippet Extraction
  // ==========================================================================

  describe('Code snippets are extracted correctly', () => {
    it('PROPERTY: Every animation has a codeSnippet', async () => {
      await fc.assert(
        fc.asyncProperty(
          framerMotionComponentArb,
          async (element) => {
            const content = generateFramerMotionComponent(element);
            const filePath = createTestFilePath('SnippetComponent.tsx');
            
            try {
              await writeTestFile(filePath, content);
              const animations = scanFileForAnimations(filePath);

              for (const animation of animations) {
                expect(animation.codeSnippet).toBeDefined();
                expect(typeof animation.codeSnippet).toBe('string');
                expect(animation.codeSnippet.length).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
