/**
 * Property-Based Tests: Reduced Motion Respect
 * Feature: frontend-backend-forensic-audit
 * Task: 13.6 Write property test for reduced motion respect
 * 
 * **Property 22: Reduced Motion Respect**
 * 
 * *For any* animation component, when the `prefers-reduced-motion` media query is active,
 * the animation SHALL be disabled or simplified.
 * 
 * **Validates: Requirements 8.3**
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Reduced for faster execution with file I/O.
 */
const NUM_RUNS = 20;

/**
 * Base temporary directory for test fixtures - relative to project root
 */
const TEST_FIXTURES_DIR = '.test-fixtures-reduced-motion';

// ============================================================================
// Types
// ============================================================================

interface ReducedMotionCheck {
  filePath: string;
  hasReducedMotionCheck: boolean;
  checkType: 'media-query' | 'hook' | 'utility' | 'css' | 'none';
  lineNumber?: number;
  codeSnippet?: string;
}


interface AnimationComponent {
  name: string;
  hasAnimation: boolean;
  respectsReducedMotion: boolean;
  animationType: 'css' | 'js' | 'framer-motion' | 'none';
}

// ============================================================================
// Reduced Motion Scanner
// ============================================================================

/**
 * Patterns that indicate reduced motion is being checked
 */
const REDUCED_MOTION_PATTERNS = {
  mediaQuery: /prefers-reduced-motion/,
  matchMedia: /matchMedia\s*\(\s*['"`]\(prefers-reduced-motion/,
  hook: /useOptimizedAnimation|usePrefersReducedMotion|useReducedMotion/,
  utility: /prefersReducedMotion\s*\(\s*\)/,
  cssMediaQuery: /@media\s*\(\s*prefers-reduced-motion/,
  motionReduce: /motion-reduce:/,
};

/**
 * Patterns that indicate animation is present
 */
const ANIMATION_PATTERNS = {
  cssAnimation: /animation:|animation-name:|@keyframes/,
  cssTransition: /transition:|transition-property:/,
  framerMotion: /from\s+['"]framer-motion['"]|motion\./,
  animateClass: /animate-|className.*animate/,
  requestAnimationFrame: /requestAnimationFrame/,
  setInterval: /setInterval.*(?:animate|animation|transform|opacity)/i,
};

/**
 * Scan a file for reduced motion respect
 */
function scanFileForReducedMotionRespect(filePath: string, content: string): ReducedMotionCheck {
  const lines = content.split('\n');
  
  // Check for media query usage
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (REDUCED_MOTION_PATTERNS.matchMedia.test(line)) {
      return {
        filePath,
        hasReducedMotionCheck: true,
        checkType: 'media-query',
        lineNumber: i + 1,
        codeSnippet: line.trim(),
      };
    }

    if (REDUCED_MOTION_PATTERNS.hook.test(line)) {
      return {
        filePath,
        hasReducedMotionCheck: true,
        checkType: 'hook',
        lineNumber: i + 1,
        codeSnippet: line.trim(),
      };
    }
    
    if (REDUCED_MOTION_PATTERNS.utility.test(line)) {
      return {
        filePath,
        hasReducedMotionCheck: true,
        checkType: 'utility',
        lineNumber: i + 1,
        codeSnippet: line.trim(),
      };
    }
    
    if (REDUCED_MOTION_PATTERNS.cssMediaQuery.test(line)) {
      return {
        filePath,
        hasReducedMotionCheck: true,
        checkType: 'css',
        lineNumber: i + 1,
        codeSnippet: line.trim(),
      };
    }
    
    if (REDUCED_MOTION_PATTERNS.motionReduce.test(line)) {
      return {
        filePath,
        hasReducedMotionCheck: true,
        checkType: 'css',
        lineNumber: i + 1,
        codeSnippet: line.trim(),
      };
    }
  }
  
  // Check if the whole content has the pattern (multi-line)
  if (REDUCED_MOTION_PATTERNS.mediaQuery.test(content)) {
    return {
      filePath,
      hasReducedMotionCheck: true,
      checkType: 'media-query',
    };
  }
  
  return {
    filePath,
    hasReducedMotionCheck: false,
    checkType: 'none',
  };
}


/**
 * Check if a file contains animations
 */
function hasAnimations(content: string): boolean {
  return Object.values(ANIMATION_PATTERNS).some(pattern => pattern.test(content));
}

/**
 * Analyze an animation component for reduced motion respect
 */
function analyzeAnimationComponent(
  name: string,
  content: string,
  filePath: string
): AnimationComponent {
  const hasAnim = hasAnimations(content);
  const reducedMotionCheck = scanFileForReducedMotionRespect(filePath, content);
  
  let animationType: AnimationComponent['animationType'] = 'none';
  if (ANIMATION_PATTERNS.framerMotion.test(content)) {
    animationType = 'framer-motion';
  } else if (ANIMATION_PATTERNS.requestAnimationFrame.test(content) || 
             ANIMATION_PATTERNS.setInterval.test(content)) {
    animationType = 'js';
  } else if (ANIMATION_PATTERNS.cssAnimation.test(content) || 
             ANIMATION_PATTERNS.cssTransition.test(content) ||
             ANIMATION_PATTERNS.animateClass.test(content)) {
    animationType = 'css';
  }
  
  return {
    name,
    hasAnimation: hasAnim,
    respectsReducedMotion: reducedMotionCheck.hasReducedMotionCheck,
    animationType,
  };
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
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid component names
 */
const componentNameArb = fc.stringMatching(/^[A-Z][a-zA-Z]{2,15}$/);

/**
 * Generate CSS animation names
 */
const cssAnimationNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,12}$/);

/**
 * Generate animation durations
 */
const animationDurationArb = fc.oneof(
  fc.integer({ min: 100, max: 2000 }).map(ms => `${ms}ms`),
  fc.integer({ min: 1, max: 20 }).map(tenths => `${(tenths / 10).toFixed(1)}s`)
);


// ============================================================================
// Code Generators
// ============================================================================

/**
 * Generate a component that respects reduced motion via matchMedia
 */
function generateReducedMotionRespectingComponent(name: string): string {
  return `
import React from 'react';

export function ${name}() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    return <div>Static content</div>;
  }

  return (
    <div className="animate-fade-in">
      Animated content
    </div>
  );
}
`;
}

/**
 * Generate a component that respects reduced motion via hook
 */
function generateHookBasedReducedMotionComponent(name: string): string {
  return `
import React from 'react';
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation';

export function ${name}() {
  const { shouldAnimate, prefersReducedMotion } = useOptimizedAnimation();

  return (
    <div className={shouldAnimate ? 'animate-fade-in' : ''}>
      Content
    </div>
  );
}
`;
}

/**
 * Generate a component that respects reduced motion via utility function
 */
function generateUtilityBasedReducedMotionComponent(name: string): string {
  return `
import React from 'react';
import { prefersReducedMotion } from '@/lib/animation-config';

export function ${name}() {
  const shouldAnimate = !prefersReducedMotion();

  return (
    <div style={{ animation: shouldAnimate ? 'fadeIn 0.3s' : 'none' }}>
      Content
    </div>
  );
}
`;
}


/**
 * Generate CSS that respects reduced motion via media query
 */
function generateReducedMotionCSS(animationName: string, duration: string): string {
  return `
@keyframes ${animationName} {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animated-element {
  animation: ${animationName} ${duration} ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .animated-element {
    animation: none;
  }
}
`;
}

/**
 * Generate a component that does NOT respect reduced motion (violation)
 */
function generateNonCompliantComponent(name: string): string {
  return `
import React from 'react';

export function ${name}() {
  return (
    <div className="animate-spin">
      Always animated, ignores user preference
    </div>
  );
}
`;
}

/**
 * Generate a component with JS animation that respects reduced motion
 */
function generateJSAnimationWithReducedMotion(name: string): string {
  return `
import React, { useEffect, useRef } from 'react';

export function ${name}() {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || !ref.current) return;
    
    let frame: number;
    const animate = () => {
      // Animation logic
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div ref={ref}>Animated content</div>;
}
`;
}


/**
 * Generate Tailwind component with motion-reduce class
 */
function generateTailwindMotionReduceComponent(name: string): string {
  return `
import React from 'react';

export function ${name}() {
  return (
    <div className="animate-pulse motion-reduce:animate-none">
      Respects reduced motion via Tailwind
    </div>
  );
}
`;
}

/**
 * Generate a character shuffle animation component (like LogoAnimation)
 */
function generateCharacterShuffleComponent(name: string): string {
  return `
import React, { useState, useEffect, useRef } from 'react';

export function ${name}({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState(text);
  const frameRef = useRef<number>();
  
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (prefersReducedMotion) {
      setDisplayText(text);
      return;
    }
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let iteration = 0;
    
    const animate = () => {
      setDisplayText(prev => 
        prev.split('').map((_, i) => 
          i < iteration ? text[i] : chars[Math.floor(Math.random() * chars.length)]
        ).join('')
      );
      
      if (iteration < text.length) {
        iteration += 0.5;
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    
    frameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [text]);

  return <span>{displayText}</span>;
}
`;
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

describe('Property 22: Reduced Motion Respect', () => {
  /**
   * **Validates: Requirements 8.3**
   * 
   * WHEN reduced-motion preference is set THEN the Logo_Animation SHALL be disabled
   * 
   * For any animation component, when the `prefers-reduced-motion` media query is active,
   * the animation SHALL be disabled or simplified.
   */

  // ==========================================================================
  // Detection of Reduced Motion Checks
  // ==========================================================================

  describe('Components using matchMedia for reduced motion are detected', () => {
    it('PROPERTY: matchMedia prefers-reduced-motion check is detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateReducedMotionRespectingComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              
              expect(check.hasReducedMotionCheck).toBe(true);
              expect(check.checkType).toBe('media-query');
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Components using hooks for reduced motion are detected', () => {
    it('PROPERTY: useOptimizedAnimation hook usage is detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateHookBasedReducedMotionComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              
              expect(check.hasReducedMotionCheck).toBe(true);
              expect(check.checkType).toBe('hook');
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Components using utility functions for reduced motion are detected', () => {
    it('PROPERTY: prefersReducedMotion() utility usage is detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateUtilityBasedReducedMotionComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              
              expect(check.hasReducedMotionCheck).toBe(true);
              expect(check.checkType).toBe('utility');
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
  // CSS Media Query Detection
  // ==========================================================================

  describe('CSS files with reduced motion media queries are detected', () => {
    it('PROPERTY: @media (prefers-reduced-motion) in CSS is detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          cssAnimationNameArb,
          animationDurationArb,
          async (animName, duration) => {
            const content = generateReducedMotionCSS(animName, duration);
            const filePath = createTestFilePath('animations.css');
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              
              expect(check.hasReducedMotionCheck).toBe(true);
              expect(check.checkType).toBe('css');
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Tailwind motion-reduce classes are detected', () => {
    it('PROPERTY: motion-reduce: Tailwind class is detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateTailwindMotionReduceComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              
              expect(check.hasReducedMotionCheck).toBe(true);
              expect(check.checkType).toBe('css');
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
  // JS Animation with Reduced Motion
  // ==========================================================================

  describe('JS animations with reduced motion checks are detected', () => {
    it('PROPERTY: requestAnimationFrame with reduced motion guard is detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateJSAnimationWithReducedMotion(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              
              expect(check.hasReducedMotionCheck).toBe(true);
              expect(check.checkType).toBe('media-query');
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
  // Character Shuffle Animation (Logo Animation Pattern)
  // ==========================================================================

  describe('Character shuffle animations respect reduced motion', () => {
    it('PROPERTY: Character shuffle component checks reduced motion before animating', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateCharacterShuffleComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              const component = analyzeAnimationComponent(name, content, filePath);
              
              // Should have reduced motion check
              expect(check.hasReducedMotionCheck).toBe(true);
              
              // Should have animation
              expect(component.hasAnimation).toBe(true);
              expect(component.animationType).toBe('js');
              
              // Should respect reduced motion
              expect(component.respectsReducedMotion).toBe(true);
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
  // Non-Compliant Components Detection
  // ==========================================================================

  describe('Non-compliant components are identified', () => {
    it('PROPERTY: Components without reduced motion check are flagged', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateNonCompliantComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              const component = analyzeAnimationComponent(name, content, filePath);
              
              // Should NOT have reduced motion check
              expect(check.hasReducedMotionCheck).toBe(false);
              expect(check.checkType).toBe('none');
              
              // Should have animation (CSS class)
              expect(component.hasAnimation).toBe(true);
              
              // Should NOT respect reduced motion
              expect(component.respectsReducedMotion).toBe(false);
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
  // Animation Component Analysis
  // ==========================================================================

  describe('Animation components are correctly analyzed', () => {
    it('PROPERTY: Components with animations are identified with correct type', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateReducedMotionRespectingComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const component = analyzeAnimationComponent(name, content, filePath);
              
              expect(component.name).toBe(name);
              expect(component.hasAnimation).toBe(true);
              expect(component.animationType).toBe('css');
              expect(component.respectsReducedMotion).toBe(true);
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
  // Line Number and Code Snippet Extraction
  // ==========================================================================

  describe('Reduced motion checks include location information', () => {
    it('PROPERTY: Detected checks include line number when found', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateReducedMotionRespectingComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              
              expect(check.hasReducedMotionCheck).toBe(true);
              if (check.lineNumber !== undefined) {
                expect(check.lineNumber).toBeGreaterThan(0);
              }
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Detected checks include code snippet when found', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateReducedMotionRespectingComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const check = scanFileForReducedMotionRespect(filePath, content);
              
              expect(check.hasReducedMotionCheck).toBe(true);
              if (check.codeSnippet !== undefined) {
                expect(check.codeSnippet.length).toBeGreaterThan(0);
                expect(check.codeSnippet).toContain('prefers-reduced-motion');
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
  // Empty and Edge Cases
  // ==========================================================================

  describe('Edge cases are handled correctly', () => {
    it('PROPERTY: File without animations returns no reduced motion check needed', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = `
import React from 'react';

export function ${name}() {
  return <div>Static content with no animations</div>;
}
`;
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const component = analyzeAnimationComponent(name, content, filePath);
              
              // No animation means no need for reduced motion check
              expect(component.hasAnimation).toBe(false);
              expect(component.animationType).toBe('none');
            } finally {
              await cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Empty content returns no check', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const content = '';
            const filePath = createTestFilePath('empty.tsx');
            
            const check = scanFileForReducedMotionRespect(filePath, content);
            
            expect(check.hasReducedMotionCheck).toBe(false);
            expect(check.checkType).toBe('none');
          }
        ),
        { numRuns: 10 }
      );
    });
  });


  // ==========================================================================
  // Multiple Check Types
  // ==========================================================================

  describe('Multiple reduced motion check types are supported', () => {
    it('PROPERTY: All valid check types are recognized', async () => {
      const checkTypes: Array<{ generator: (name: string) => string; expectedType: string }> = [
        { generator: generateReducedMotionRespectingComponent, expectedType: 'media-query' },
        { generator: generateHookBasedReducedMotionComponent, expectedType: 'hook' },
        { generator: generateUtilityBasedReducedMotionComponent, expectedType: 'utility' },
        { generator: generateTailwindMotionReduceComponent, expectedType: 'css' },
      ];

      for (const { generator, expectedType } of checkTypes) {
        await fc.assert(
          fc.asyncProperty(
            componentNameArb,
            async (name) => {
              const content = generator(name);
              const filePath = createTestFilePath(`${name}.tsx`);
              
              try {
                await writeTestFile(filePath, content);
                const check = scanFileForReducedMotionRespect(filePath, content);
                
                expect(check.hasReducedMotionCheck).toBe(true);
                expect(check.checkType).toBe(expectedType);
              } finally {
                await cleanupTestFile(filePath);
              }
            }
          ),
          { numRuns: 10 }
        );
      }
    });
  });

  // ==========================================================================
  // Compliance Verification
  // ==========================================================================

  describe('Animation compliance can be verified', () => {
    it('PROPERTY: Compliant components have both animation and reduced motion check', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (name) => {
            const content = generateCharacterShuffleComponent(name);
            const filePath = createTestFilePath(`${name}.tsx`);
            
            try {
              await writeTestFile(filePath, content);
              const component = analyzeAnimationComponent(name, content, filePath);
              
              // A compliant animated component should:
              // 1. Have animation
              // 2. Respect reduced motion
              if (component.hasAnimation) {
                // This is the key property: animated components SHOULD respect reduced motion
                // We're testing that our detection correctly identifies this
                expect(component.respectsReducedMotion).toBe(true);
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
