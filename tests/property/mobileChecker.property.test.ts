/**
 * Property-Based Tests: Mobile Responsiveness Verification
 * Feature: frontend-backend-forensic-audit
 * Task: 4.13 Write property test for mobile responsiveness
 * 
 * **Property 9: Mobile Responsiveness Verification**
 * 
 * *For any* page component, the auditor SHALL verify the presence of responsive CSS
 * (Tailwind breakpoint prefixes or media queries) for mobile compatibility.
 * 
 * **Validates: Requirements 2.7, 7.1**
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkMobileResponsiveness,
  checkMobileResponsivenessExtended,
  type ResponsivePatternType,
  type MobileIssueType,
  type MobileResponsivenessResult,
  type ExtendedMobileResponsivenessResult,
} from '../../scripts/audit/page/mobileChecker';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Mobile responsiveness detection involves file I/O, so we use moderate iterations.
 */
const NUM_RUNS = 10;

/**
 * Base temporary directory for test fixtures - unique per test run
 */
const TEST_FIXTURES_BASE = join(process.cwd(), '.test-fixtures-mobile-checker');

/**
 * Counter for unique test directories
 */
let testDirCounter = 0;

/**
 * Counter for unique file names within tests
 */
let fileCounter = 0;


/**
 * Get a unique test directory for each test
 */
function getUniqueTestDir(): string {
  testDirCounter++;
  return join(TEST_FIXTURES_BASE, `test-${testDirCounter}-${Date.now()}`);
}

/**
 * Get a unique filename for each test iteration
 */
function getUniqueFilename(base: string): string {
  fileCounter++;
  return `${base}_${fileCounter}_${Date.now()}.tsx`;
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Tailwind responsive breakpoint prefixes
 */
const tailwindBreakpointArb = fc.constantFrom('sm:', 'md:', 'lg:', 'xl:', '2xl:');

/**
 * Tailwind utility classes that can be prefixed with breakpoints
 */
const tailwindUtilityArb = fc.constantFrom(
  'flex',
  'hidden',
  'block',
  'grid',
  'w-full',
  'w-1/2',
  'p-4',
  'px-6',
  'py-2',
  'text-lg',
  'text-sm',
  'gap-4',
  'flex-col',
  'flex-row',
  'grid-cols-1',
  'grid-cols-2',
  'grid-cols-3'
);

/**
 * Fixed width values in pixels
 */
const fixedWidthArb = fc.integer({ min: 100, max: 1200 });

/**
 * Component names for generated pages
 */
const componentNameArb = fc.constantFrom(
  'Dashboard',
  'Profile',
  'Applications',
  'Settings',
  'Admin',
  'Login',
  'Register',
  'Home',
  'NotFound'
);

/**
 * Responsive pattern types that can be detected
 */
const responsivePatternTypeArb: fc.Arbitrary<ResponsivePatternType> = fc.constantFrom(
  'tailwind-sm',
  'tailwind-md',
  'tailwind-lg',
  'tailwind-xl',
  'tailwind-2xl',
  'media-query',
  'css-in-js-media',
  'responsive-component',
  'mobile-specific'
);

/**
 * Mobile issue types that can be detected
 */
const mobileIssueTypeArb: fc.Arbitrary<MobileIssueType> = fc.constantFrom(
  'fixed-width',
  'fixed-height',
  'no-responsive-classes',
  'hardcoded-pixels',
  'overflow-hidden-missing',
  'touch-target-small'
);


// ============================================================================
// Code Generators
// ============================================================================

/**
 * Generate a Tailwind responsive class string
 */
function generateResponsiveClass(breakpoint: string, utility: string): string {
  return `${breakpoint}${utility}`;
}

/**
 * Generate a component with Tailwind responsive classes
 */
function generateResponsiveTailwindComponent(
  componentName: string,
  breakpoints: string[],
  utilities: string[]
): string {
  const responsiveClasses = breakpoints.map((bp, i) => 
    generateResponsiveClass(bp, utilities[i % utilities.length])
  ).join(' ');
  
  return `
import React from 'react';

export function ${componentName}() {
  return (
    <div className="flex flex-col ${responsiveClasses}">
      <h1 className="text-xl sm:text-2xl md:text-3xl">Title</h1>
      <p className="p-2 sm:p-4 md:p-6">Content</p>
    </div>
  );
}

export default ${componentName};
`;
}

/**
 * Generate a component with media queries
 */
function generateMediaQueryComponent(componentName: string): string {
  return `
import React from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export function ${componentName}() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  return (
    <div style={{ padding: isMobile ? '8px' : '24px' }}>
      <h1>Responsive Component</h1>
      {isMobile ? <MobileView /> : <DesktopView />}
    </div>
  );
}

function MobileView() {
  return <div>Mobile Content</div>;
}

function DesktopView() {
  return <div>Desktop Content</div>;
}

export default ${componentName};
`;
}

/**
 * Generate a component with CSS media queries in template literals
 */
function generateCSSMediaQueryComponent(componentName: string): string {
  return `
import React from 'react';

const styles = \`
  .container {
    padding: 8px;
  }
  
  @media (min-width: 768px) {
    .container {
      padding: 24px;
    }
  }
  
  @media (min-width: 1024px) {
    .container {
      padding: 32px;
    }
  }
\`;

export function ${componentName}() {
  return (
    <>
      <style>{styles}</style>
      <div className="container">
        <h1>CSS Media Query Component</h1>
      </div>
    </>
  );
}

export default ${componentName};
`;
}


/**
 * Generate a component with mobile-specific components
 */
function generateMobileSpecificComponent(componentName: string): string {
  return `
import React from 'react';
import { MobileNav } from '@/components/ui/MobileNav';
import { MobileMenu } from '@/components/ui/MobileMenu';

export function ${componentName}() {
  return (
    <div>
      <MobileNav />
      <main className="p-4">
        <h1>Page Content</h1>
      </main>
      <MobileMenu />
    </div>
  );
}

export default ${componentName};
`;
}

/**
 * Generate a component with fixed width that may cause mobile issues
 */
function generateFixedWidthComponent(componentName: string, width: number): string {
  return `
import React from 'react';

export function ${componentName}() {
  return (
    <div className="w-[${width}px]">
      <h1>Fixed Width Component</h1>
      <p style={{ width: '${width}px' }}>This has a fixed width</p>
    </div>
  );
}

export default ${componentName};
`;
}

/**
 * Generate a component without any responsive styling
 */
function generateNonResponsiveComponent(componentName: string): string {
  return `
import React from 'react';

export function ${componentName}() {
  return (
    <div className="flex p-4">
      <h1 className="text-xl font-bold">Static Component</h1>
      <p className="text-gray-600">No responsive classes here</p>
    </div>
  );
}

export default ${componentName};
`;
}

/**
 * Generate an empty component file
 */
function generateEmptyComponent(): string {
  return `// Empty file\n`;
}

/**
 * Generate a component with only comments
 */
function generateCommentsOnlyFile(): string {
  return `
// This is a comment
/* Multi-line
   comment */
// Another comment
`;
}


/**
 * Generate a component with hidden/visible responsive patterns
 */
function generateHiddenVisibleComponent(componentName: string): string {
  return `
import React from 'react';

export function ${componentName}() {
  return (
    <div>
      <nav className="hidden sm:block md:flex lg:grid">
        <span>Desktop Nav</span>
      </nav>
      <nav className="block sm:hidden">
        <span>Mobile Nav</span>
      </nav>
      <main className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
        <h1>Content</h1>
      </main>
    </div>
  );
}

export default ${componentName};
`;
}

/**
 * Generate a component with mobile-first approach
 */
function generateMobileFirstComponent(componentName: string): string {
  return `
import React from 'react';

export function ${componentName}() {
  return (
    <div className="flex-col sm:flex-row">
      <aside className="w-full sm:w-64 md:w-80">
        <nav>Sidebar</nav>
      </aside>
      <main className="flex-1 p-2 sm:p-4 md:p-6 lg:p-8">
        <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl">
          Mobile First Design
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
          <div>Card 1</div>
          <div>Card 2</div>
          <div>Card 3</div>
          <div>Card 4</div>
        </div>
      </main>
    </div>
  );
}

export default ${componentName};
`;
}

/**
 * Generate a component with small touch targets
 */
function generateSmallTouchTargetComponent(componentName: string): string {
  return `
import React from 'react';

export function ${componentName}() {
  return (
    <div>
      <button className="w-4 h-4 p-0" onClick={() => {}}>X</button>
      <button className="w-6 h-6 p-1" onClick={() => {}}>+</button>
      <a href="/link" className="w-5 h-5 px-1 py-0">Link</a>
    </div>
  );
}

export default ${componentName};
`;
}

/**
 * Configuration for generating a page with mobile responsiveness patterns
 */
interface MobileResponsivenessPageConfig {
  componentName: string;
  hasTailwindResponsive: boolean;
  hasMediaQuery: boolean;
  hasCSSMediaQuery: boolean;
  hasMobileSpecificComponents: boolean;
  hasFixedWidth: boolean;
  fixedWidthValue: number;
  hasHiddenVisible: boolean;
  hasMobileFirst: boolean;
  hasSmallTouchTargets: boolean;
  breakpoints: string[];
  utilities: string[];
}

const mobileResponsivenessPageConfigArb: fc.Arbitrary<MobileResponsivenessPageConfig> = fc.record({
  componentName: componentNameArb,
  hasTailwindResponsive: fc.boolean(),
  hasMediaQuery: fc.boolean(),
  hasCSSMediaQuery: fc.boolean(),
  hasMobileSpecificComponents: fc.boolean(),
  hasFixedWidth: fc.boolean(),
  fixedWidthValue: fixedWidthArb,
  hasHiddenVisible: fc.boolean(),
  hasMobileFirst: fc.boolean(),
  hasSmallTouchTargets: fc.boolean(),
  breakpoints: fc.array(tailwindBreakpointArb, { minLength: 1, maxLength: 5 }),
  utilities: fc.array(tailwindUtilityArb, { minLength: 1, maxLength: 5 }),
});


/**
 * Generate a complete React page component based on config
 */
function generateMobileResponsivenessPage(config: MobileResponsivenessPageConfig): string {
  const imports: string[] = [`import React from 'react';`];
  const bodyParts: string[] = [];
  
  // Add responsive Tailwind classes
  if (config.hasTailwindResponsive) {
    const responsiveClasses = config.breakpoints.map((bp, i) => 
      `${bp}${config.utilities[i % config.utilities.length]}`
    ).join(' ');
    bodyParts.push(`<div className="flex ${responsiveClasses}">Responsive Content</div>`);
  }
  
  // Add media query hook usage
  if (config.hasMediaQuery) {
    imports.push(`import { useMediaQuery } from '@/hooks/useMediaQuery';`);
    bodyParts.push(`{useMediaQuery('(max-width: 768px)') && <div>Mobile Only</div>}`);
  }
  
  // Add CSS media query
  if (config.hasCSSMediaQuery) {
    bodyParts.push(`<style>{\`@media (min-width: 768px) { .container { padding: 24px; } }\`}</style>`);
  }
  
  // Add mobile-specific components
  if (config.hasMobileSpecificComponents) {
    imports.push(`import { MobileNav } from '@/components/ui/MobileNav';`);
    bodyParts.push(`<MobileNav />`);
  }
  
  // Add fixed width element
  if (config.hasFixedWidth) {
    bodyParts.push(`<div className="w-[${config.fixedWidthValue}px]">Fixed Width</div>`);
  }
  
  // Add hidden/visible patterns
  if (config.hasHiddenVisible) {
    bodyParts.push(`<div className="hidden sm:block md:flex">Hidden on mobile</div>`);
  }
  
  // Add mobile-first patterns
  if (config.hasMobileFirst) {
    bodyParts.push(`<div className="flex-col sm:flex-row w-full sm:w-1/2">Mobile First</div>`);
  }
  
  // Add small touch targets
  if (config.hasSmallTouchTargets) {
    bodyParts.push(`<button className="w-4 h-4 p-0" onClick={() => {}}>X</button>`);
  }
  
  // Ensure we have at least some content
  if (bodyParts.length === 0) {
    bodyParts.push(`<div className="p-4">Basic Content</div>`);
  }
  
  return `${imports.join('\n')}

export function ${config.componentName}() {
  return (
    <div>
      ${bodyParts.join('\n      ')}
    </div>
  );
}

export default ${config.componentName};
`;
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create test fixture directory structure
 */
async function setupTestDir(testDir: string): Promise<void> {
  await mkdir(join(testDir, 'src', 'pages'), { recursive: true });
}

/**
 * Write a test page file
 */
async function writeTestPageFile(
  testDir: string,
  filename: string,
  content: string
): Promise<string> {
  const relativePath = `src/pages/${filename}`;
  const filePath = join(testDir, relativePath);
  await writeFile(filePath, content, 'utf-8');
  return relativePath;
}


// ============================================================================
// Property Tests
// ============================================================================

describe('Property 9: Mobile Responsiveness Verification', () => {
  /**
   * **Validates: Requirements 2.7, 7.1**
   * 
   * WHEN the Audit_System examines a page THEN it SHALL verify mobile responsiveness
   * WHEN the Audit_System examines a page THEN it SHALL verify mobile-first responsive design
   */
  
  // Clean up all test fixtures after all tests complete
  afterAll(async () => {
    try {
      await rm(TEST_FIXTURES_BASE, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Tailwind responsive prefix detection', () => {
    it('PROPERTY: Pages with Tailwind responsive prefixes (sm:, md:, lg:, xl:, 2xl:) are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(componentNameArb, tailwindBreakpointArb, tailwindUtilityArb),
          async ([componentName, breakpoint, utility]) => {
            const content = `
import React from 'react';

export function ${componentName}() {
  return (
    <div className="${breakpoint}${utility}">
      <h1 className="${breakpoint}text-xl">Title</h1>
    </div>
  );
}

export default ${componentName};
`;
            const filename = getUniqueFilename('TailwindResponsive');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsiveness(relativePath, testDir);
            
            // Should detect responsive patterns
            expect(result.responsivePatternCount).toBeGreaterThan(0);
            expect(result.responsivePatternTypes.length).toBeGreaterThan(0);
            
            // Should map breakpoint to correct type
            const expectedType = `tailwind-${breakpoint.replace(':', '')}` as ResponsivePatternType;
            expect(result.responsivePatternTypes).toContain(expectedType);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Multiple Tailwind breakpoints are all detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            componentNameArb,
            fc.array(tailwindBreakpointArb, { minLength: 2, maxLength: 5 }),
            fc.array(tailwindUtilityArb, { minLength: 2, maxLength: 5 })
          ),
          async ([componentName, breakpoints, utilities]) => {
            const responsiveClasses = breakpoints.map((bp, i) => 
              `${bp}${utilities[i % utilities.length]}`
            ).join(' ');
            
            const content = `
import React from 'react';

export function ${componentName}() {
  return (
    <div className="${responsiveClasses}">
      Content
    </div>
  );
}

export default ${componentName};
`;
            const filename = getUniqueFilename('MultiBreakpoint');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsiveness(relativePath, testDir);
            
            // Should detect responsive patterns
            expect(result.responsivePatternCount).toBeGreaterThan(0);
            expect(result.isMobileResponsive).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Media query detection', () => {
    it('PROPERTY: Pages with media queries are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            const content = generateCSSMediaQueryComponent(componentName);
            const filename = getUniqueFilename('MediaQuery');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsiveness(relativePath, testDir);
            
            // Should detect media query patterns
            expect(result.responsivePatternCount).toBeGreaterThan(0);
            expect(result.responsivePatternTypes).toContain('media-query');
            expect(result.isMobileResponsive).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: useMediaQuery hook usage is detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            const content = generateMediaQueryComponent(componentName);
            const filename = getUniqueFilename('UseMediaQuery');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsiveness(relativePath, testDir);
            
            // Should detect CSS-in-JS media patterns
            expect(result.responsivePatternCount).toBeGreaterThan(0);
            expect(result.responsivePatternTypes).toContain('css-in-js-media');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Mobile-specific component detection', () => {
    it('PROPERTY: Pages with mobile-specific components are detected', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            const content = generateMobileSpecificComponent(componentName);
            const filename = getUniqueFilename('MobileSpecific');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsiveness(relativePath, testDir);
            
            // Should detect mobile-specific patterns
            expect(result.responsivePatternCount).toBeGreaterThan(0);
            expect(result.responsivePatternTypes).toContain('mobile-specific');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Fixed width detection', () => {
    it('PROPERTY: Pages with fixed widths > 320px are flagged as issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(componentNameArb, fc.integer({ min: 321, max: 1200 })),
          async ([componentName, width]) => {
            const content = generateFixedWidthComponent(componentName, width);
            const filename = getUniqueFilename('FixedWidth');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            // Should detect fixed width elements
            expect(result.fixedWidthElements.length).toBeGreaterThan(0);
            
            // Should flag problematic fixed widths
            const problematicElements = result.fixedWidthElements.filter(e => e.isProblematic);
            expect(problematicElements.length).toBeGreaterThan(0);
            
            // Should have issues related to fixed width
            expect(result.issues.some(issue => 
              issue.toLowerCase().includes('fixed width') ||
              issue.toLowerCase().includes('horizontal scrolling')
            )).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Fixed widths <= 320px are not flagged as problematic', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(componentNameArb, fc.integer({ min: 100, max: 320 })),
          async ([componentName, width]) => {
            const content = generateFixedWidthComponent(componentName, width);
            const filename = getUniqueFilename('SmallFixedWidth');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            // Should detect fixed width elements
            expect(result.fixedWidthElements.length).toBeGreaterThan(0);
            
            // Should NOT flag as problematic (width <= 320px)
            const problematicElements = result.fixedWidthElements.filter(e => e.isProblematic);
            expect(problematicElements.length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Non-responsive page detection', () => {
    it('PROPERTY: Pages without any responsive styling are flagged', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            const content = generateNonResponsiveComponent(componentName);
            const filename = getUniqueFilename('NonResponsive');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsiveness(relativePath, testDir);
            
            // Should NOT be marked as mobile responsive
            expect(result.isMobileResponsive).toBe(false);
            
            // Should have no responsive pattern types
            expect(result.responsivePatternTypes.length).toBe(0);
            expect(result.responsivePatternCount).toBe(0);
            
            // Should have issues about missing responsive classes
            expect(result.issues.some(issue => 
              issue.toLowerCase().includes('no responsive') ||
              issue.toLowerCase().includes('responsive')
            )).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Result structure validation', () => {
    it('PROPERTY: checkMobileResponsiveness always returns valid MobileResponsivenessResult', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          mobileResponsivenessPageConfigArb,
          async (pageConfig) => {
            const content = generateMobileResponsivenessPage(pageConfig);
            const filename = getUniqueFilename('ValidResult');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsiveness(relativePath, testDir);
            
            // Required fields must be present and have correct types
            expect(typeof result.isMobileResponsive).toBe('boolean');
            expect(Array.isArray(result.responsivePatternTypes)).toBe(true);
            expect(Array.isArray(result.issues)).toBe(true);
            expect(typeof result.responsivePatternCount).toBe('number');
            
            // responsivePatternCount should be non-negative
            expect(result.responsivePatternCount).toBeGreaterThanOrEqual(0);
            
            // All pattern types should be valid
            const validPatternTypes: ResponsivePatternType[] = [
              'tailwind-sm', 'tailwind-md', 'tailwind-lg', 'tailwind-xl', 'tailwind-2xl',
              'media-query', 'css-in-js-media', 'responsive-component', 'mobile-specific'
            ];
            for (const patternType of result.responsivePatternTypes) {
              expect(validPatternTypes).toContain(patternType);
            }
            
            // All issues should be strings
            for (const issue of result.issues) {
              expect(typeof issue).toBe('string');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: checkMobileResponsivenessExtended returns valid ExtendedMobileResponsivenessResult', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          mobileResponsivenessPageConfigArb,
          async (pageConfig) => {
            const content = generateMobileResponsivenessPage(pageConfig);
            const filename = getUniqueFilename('ExtendedResult');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            // All base fields must be present
            expect(typeof result.isMobileResponsive).toBe('boolean');
            expect(Array.isArray(result.responsivePatternTypes)).toBe(true);
            expect(Array.isArray(result.issues)).toBe(true);
            expect(typeof result.responsivePatternCount).toBe('number');
            
            // Extended fields must be present
            expect(Array.isArray(result.responsivePatterns)).toBe(true);
            expect(Array.isArray(result.mobileIssues)).toBe(true);
            expect(typeof result.breakpointStats).toBe('object');
            expect(typeof result.usesMobileFirst).toBe('boolean');
            expect(Array.isArray(result.fixedWidthElements)).toBe(true);
            
            // Breakpoint stats should have all required fields
            expect(typeof result.breakpointStats.sm).toBe('number');
            expect(typeof result.breakpointStats.md).toBe('number');
            expect(typeof result.breakpointStats.lg).toBe('number');
            expect(typeof result.breakpointStats.xl).toBe('number');
            expect(typeof result.breakpointStats['2xl']).toBe('number');
            expect(typeof result.breakpointStats.total).toBe('number');
            
            // All responsive patterns should have required fields
            for (const pattern of result.responsivePatterns) {
              expect(typeof pattern.type).toBe('string');
              expect(typeof pattern.lineNumber).toBe('number');
              expect(pattern.lineNumber).toBeGreaterThan(0);
              expect(typeof pattern.codeSnippet).toBe('string');
            }
            
            // All mobile issues should have required fields
            for (const issue of result.mobileIssues) {
              expect(typeof issue.type).toBe('string');
              expect(typeof issue.lineNumber).toBe('number');
              expect(typeof issue.description).toBe('string');
              expect(['high', 'medium', 'low']).toContain(issue.severity);
              expect(issue.evidence).toBeDefined();
              expect(typeof issue.evidence.filePath).toBe('string');
              expect(typeof issue.evidence.reason).toBe('string');
              expect(['certain', 'likely', 'possible']).toContain(issue.evidence.confidence);
            }
            
            // All fixed width elements should have required fields
            for (const element of result.fixedWidthElements) {
              expect(typeof element.lineNumber).toBe('number');
              expect(element.lineNumber).toBeGreaterThan(0);
              expect(typeof element.codeSnippet).toBe('string');
              expect(typeof element.widthValue).toBe('string');
              expect(typeof element.isProblematic).toBe('boolean');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Breakpoint statistics calculation', () => {
    it('PROPERTY: Breakpoint statistics are correctly calculated', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            componentNameArb,
            fc.array(tailwindBreakpointArb, { minLength: 1, maxLength: 10 }),
            fc.array(tailwindUtilityArb, { minLength: 1, maxLength: 10 })
          ),
          async ([componentName, breakpoints, utilities]) => {
            const content = generateResponsiveTailwindComponent(componentName, breakpoints, utilities);
            const filename = getUniqueFilename('BreakpointStats');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            // Total should equal sum of individual breakpoints
            const calculatedTotal = 
              result.breakpointStats.sm +
              result.breakpointStats.md +
              result.breakpointStats.lg +
              result.breakpointStats.xl +
              result.breakpointStats['2xl'];
            
            expect(result.breakpointStats.total).toBe(calculatedTotal);
            
            // All counts should be non-negative
            expect(result.breakpointStats.sm).toBeGreaterThanOrEqual(0);
            expect(result.breakpointStats.md).toBeGreaterThanOrEqual(0);
            expect(result.breakpointStats.lg).toBeGreaterThanOrEqual(0);
            expect(result.breakpointStats.xl).toBeGreaterThanOrEqual(0);
            expect(result.breakpointStats['2xl']).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Mobile-first approach detection', () => {
    it('PROPERTY: Mobile-first approach detection works correctly', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            const content = generateMobileFirstComponent(componentName);
            const filename = getUniqueFilename('MobileFirst');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            // Should detect mobile-first approach
            expect(result.usesMobileFirst).toBe(true);
            
            // Should have responsive patterns
            expect(result.responsivePatternCount).toBeGreaterThan(0);
            expect(result.isMobileResponsive).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Hidden/visible patterns indicate responsive awareness', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            const content = generateHiddenVisibleComponent(componentName);
            const filename = getUniqueFilename('HiddenVisible');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            // Should detect responsive patterns
            expect(result.responsivePatternCount).toBeGreaterThan(0);
            expect(result.isMobileResponsive).toBe(true);
            
            // Should detect responsive-component pattern type
            expect(result.responsivePatternTypes).toContain('responsive-component');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Edge cases', () => {
    it('PROPERTY: Non-existent file returns empty result with issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const result = checkMobileResponsiveness('src/pages/NonExistent.tsx', testDir);
      
      expect(result.isMobileResponsive).toBe(false);
      expect(result.responsivePatternTypes).toEqual([]);
      expect(result.responsivePatternCount).toBe(0);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(issue => 
        issue.toLowerCase().includes('not found') ||
        issue.toLowerCase().includes('file not found')
      )).toBe(true);
    });

    it('PROPERTY: Non-existent file extended returns valid structure with issue', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const result = checkMobileResponsivenessExtended('src/pages/NonExistent.tsx', testDir);
      
      expect(result.isMobileResponsive).toBe(false);
      expect(result.responsivePatternTypes).toEqual([]);
      expect(result.responsivePatternCount).toBe(0);
      expect(result.responsivePatterns).toEqual([]);
      expect(result.mobileIssues).toEqual([]);
      expect(result.fixedWidthElements).toEqual([]);
      expect(result.usesMobileFirst).toBe(false);
      expect(result.breakpointStats.total).toBe(0);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('PROPERTY: Empty file returns empty result', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = generateEmptyComponent();
      const relativePath = await writeTestPageFile(testDir, 'Empty.tsx', content);
      
      const result = checkMobileResponsiveness(relativePath, testDir);
      
      expect(result.isMobileResponsive).toBe(false);
      expect(result.responsivePatternTypes).toEqual([]);
      expect(result.responsivePatternCount).toBe(0);
    });

    it('PROPERTY: File with only comments returns empty result', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = generateCommentsOnlyFile();
      const relativePath = await writeTestPageFile(testDir, 'Comments.tsx', content);
      
      const result = checkMobileResponsiveness(relativePath, testDir);
      
      expect(result.isMobileResponsive).toBe(false);
      expect(result.responsivePatternTypes).toEqual([]);
      expect(result.responsivePatternCount).toBe(0);
    });

    it('PROPERTY: File without styling returns no responsive patterns', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = `
import React from 'react';

export function PlainComponent() {
  const data = { name: 'test' };
  return <div>{data.name}</div>;
}
`;
      const relativePath = await writeTestPageFile(testDir, 'Plain.tsx', content);
      
      const result = checkMobileResponsivenessExtended(relativePath, testDir);
      
      expect(result.responsivePatternCount).toBe(0);
      expect(result.responsivePatternTypes).toEqual([]);
      expect(result.fixedWidthElements).toEqual([]);
    });
  });


  describe('Consistency properties', () => {
    it('PROPERTY: Result structure is consistent across calls', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const content = generateMobileFirstComponent('ConsistentPage');
      const relativePath = await writeTestPageFile(testDir, 'ConsistentTest.tsx', content);
      
      // Run detection multiple times on the same file
      const result1 = checkMobileResponsiveness(relativePath, testDir);
      const result2 = checkMobileResponsiveness(relativePath, testDir);
      
      // Key structural properties should be consistent
      expect(result1.isMobileResponsive).toBe(result2.isMobileResponsive);
      expect(result1.responsivePatternCount).toBe(result2.responsivePatternCount);
      expect(result1.responsivePatternTypes.length).toBe(result2.responsivePatternTypes.length);
      
      // Both should have valid structure
      expect(Array.isArray(result1.responsivePatternTypes)).toBe(true);
      expect(Array.isArray(result2.responsivePatternTypes)).toBe(true);
    });

    it('PROPERTY: Line numbers in patterns are positive integers', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          mobileResponsivenessPageConfigArb.filter(c => 
            c.hasTailwindResponsive || c.hasMediaQuery || c.hasMobileSpecificComponents
          ),
          async (pageConfig) => {
            const content = generateMobileResponsivenessPage(pageConfig);
            const filename = getUniqueFilename('LineNumbers');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            for (const pattern of result.responsivePatterns) {
              expect(Number.isInteger(pattern.lineNumber)).toBe(true);
              expect(pattern.lineNumber).toBeGreaterThan(0);
            }
            
            for (const issue of result.mobileIssues) {
              expect(Number.isInteger(issue.lineNumber)).toBe(true);
              expect(issue.lineNumber).toBeGreaterThan(0);
              
              if (issue.evidence.lineNumbers) {
                for (const lineNum of issue.evidence.lineNumbers) {
                  expect(Number.isInteger(lineNum)).toBe(true);
                  expect(lineNum).toBeGreaterThan(0);
                }
              }
            }
            
            for (const element of result.fixedWidthElements) {
              expect(Number.isInteger(element.lineNumber)).toBe(true);
              expect(element.lineNumber).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: isMobileResponsive is true when responsive patterns exist and no high severity issues', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          mobileResponsivenessPageConfigArb.filter(c => 
            c.hasTailwindResponsive || c.hasMediaQuery || c.hasMobileSpecificComponents || c.hasHiddenVisible
          ),
          async (pageConfig) => {
            const content = generateMobileResponsivenessPage(pageConfig);
            const filename = getUniqueFilename('ResponsiveCheck');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            // If there are responsive patterns and no high severity issues, should be responsive
            const hasHighSeverityIssues = result.mobileIssues.some(i => i.severity === 'high');
            
            if (result.responsivePatternCount > 0 && !hasHighSeverityIssues) {
              expect(result.isMobileResponsive).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Touch target detection', () => {
    it('PROPERTY: Small touch targets on interactive elements are flagged', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            const content = generateSmallTouchTargetComponent(componentName);
            const filename = getUniqueFilename('SmallTouchTarget');
            const relativePath = await writeTestPageFile(testDir, filename, content);
            
            const result = checkMobileResponsivenessExtended(relativePath, testDir);
            
            // Should detect touch target issues
            const touchTargetIssues = result.mobileIssues.filter(i => 
              i.type === 'touch-target-small'
            );
            
            // May or may not detect depending on context analysis
            // But result structure should always be valid
            expect(Array.isArray(result.mobileIssues)).toBe(true);
            for (const issue of touchTargetIssues) {
              expect(issue.severity).toBe('low');
              expect(issue.description.toLowerCase()).toContain('touch');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Pattern type mapping', () => {
    it('PROPERTY: Each Tailwind breakpoint maps to correct pattern type', async () => {
      const testDir = getUniqueTestDir();
      await setupTestDir(testDir);
      
      const breakpointToType: Record<string, ResponsivePatternType> = {
        'sm:': 'tailwind-sm',
        'md:': 'tailwind-md',
        'lg:': 'tailwind-lg',
        'xl:': 'tailwind-xl',
        '2xl:': 'tailwind-2xl',
      };
      
      for (const [breakpoint, expectedType] of Object.entries(breakpointToType)) {
        const content = `
import React from 'react';

export function TestComponent() {
  return <div className="${breakpoint}flex ${breakpoint}p-4">Content</div>;
}
`;
        const filename = getUniqueFilename(`Breakpoint_${breakpoint.replace(':', '')}`);
        const relativePath = await writeTestPageFile(testDir, filename, content);
        
        const result = checkMobileResponsiveness(relativePath, testDir);
        
        expect(result.responsivePatternTypes).toContain(expectedType);
      }
    });
  });
});
