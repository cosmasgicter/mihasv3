/**
 * Mobile Responsiveness Checker for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans page files to verify mobile responsiveness by detecting:
 * - Tailwind responsive prefixes (sm:, md:, lg:, xl:, 2xl:)
 * - Media query usage in CSS-in-JS or inline styles
 * - Mobile-specific components or patterns
 * - Fixed widths that may cause issues on mobile
 * 
 * @requirements 2.7 - WHEN the Audit_System examines a page THEN it SHALL verify
 *                     mobile responsiveness
 * @requirements 7.1 - WHEN the Audit_System examines a page THEN it SHALL verify
 *                     mobile-first responsive design
 * 
 * Property 9: Mobile Responsiveness Verification
 * *For any* page component, the auditor SHALL verify the presence of responsive CSS
 * (Tailwind breakpoint prefixes or media queries) for mobile compatibility.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Evidence } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of responsive patterns that can be detected.
 */
export type ResponsivePatternType =
  | 'tailwind-sm'
  | 'tailwind-md'
  | 'tailwind-lg'
  | 'tailwind-xl'
  | 'tailwind-2xl'
  | 'media-query'
  | 'css-in-js-media'
  | 'responsive-component'
  | 'mobile-specific';

/**
 * Types of mobile issues that can be detected.
 */
export type MobileIssueType =
  | 'fixed-width'
  | 'fixed-height'
  | 'no-responsive-classes'
  | 'hardcoded-pixels'
  | 'overflow-hidden-missing'
  | 'touch-target-small';

/**
 * Information about a detected responsive pattern.
 */
export interface ResponsivePattern {
  /** Type of responsive pattern */
  type: ResponsivePatternType;
  /** Line number where detected */
  lineNumber: number;
  /** Code snippet */
  codeSnippet: string;
  /** Breakpoint value (if applicable) */
  breakpoint?: string;
}

/**
 * Information about a detected mobile issue.
 */
export interface MobileIssue {
  /** Type of mobile issue */
  type: MobileIssueType;
  /** Line number where detected */
  lineNumber: number;
  /** Code snippet */
  codeSnippet: string;
  /** Description of the issue */
  description: string;
  /** Severity of the issue */
  severity: 'high' | 'medium' | 'low';
  /** Evidence for the issue */
  evidence: Evidence;
}

/**
 * Result of checking mobile responsiveness in a page file.
 */
export interface MobileResponsivenessResult {
  /** Whether the page has responsive styling */
  isMobileResponsive: boolean;
  /** Types of responsive patterns found */
  responsivePatternTypes: ResponsivePatternType[];
  /** Mobile issues detected */
  issues: string[];
  /** Count of responsive patterns found */
  responsivePatternCount: number;
}

/**
 * Extended result with detailed information for analysis.
 */
export interface ExtendedMobileResponsivenessResult extends MobileResponsivenessResult {
  /** All responsive patterns detected */
  responsivePatterns: ResponsivePattern[];
  /** All mobile issues detected */
  mobileIssues: MobileIssue[];
  /** Tailwind breakpoint usage statistics */
  breakpointStats: BreakpointStats;
  /** Whether the page uses mobile-first approach */
  usesMobileFirst: boolean;
  /** Fixed width elements found */
  fixedWidthElements: FixedWidthElement[];
}

/**
 * Statistics about Tailwind breakpoint usage.
 */
export interface BreakpointStats {
  /** Count of sm: prefixes */
  sm: number;
  /** Count of md: prefixes */
  md: number;
  /** Count of lg: prefixes */
  lg: number;
  /** Count of xl: prefixes */
  xl: number;
  /** Count of 2xl: prefixes */
  '2xl': number;
  /** Total responsive classes */
  total: number;
}

/**
 * Information about a fixed width element.
 */
export interface FixedWidthElement {
  /** Line number where detected */
  lineNumber: number;
  /** Code snippet */
  codeSnippet: string;
  /** The fixed width value */
  widthValue: string;
  /** Whether it's problematic for mobile */
  isProblematic: boolean;
}


// =============================================================================
// Detection Patterns
// =============================================================================

/**
 * Patterns for detecting Tailwind responsive prefixes.
 */
const TAILWIND_RESPONSIVE_PATTERNS = {
  /** sm: breakpoint (640px+) */
  sm: /\bsm:/g,
  
  /** md: breakpoint (768px+) */
  md: /\bmd:/g,
  
  /** lg: breakpoint (1024px+) */
  lg: /\blg:/g,
  
  /** xl: breakpoint (1280px+) */
  xl: /\bxl:/g,
  
  /** 2xl: breakpoint (1536px+) */
  '2xl': /\b2xl:/g,
};

/**
 * Patterns for detecting media queries.
 */
const MEDIA_QUERY_PATTERNS = {
  /** CSS media query in template literals or strings */
  cssMediaQuery: /@media\s*\([^)]*\)/g,
  
  /** useMediaQuery hook usage */
  useMediaQueryHook: /useMediaQuery\s*\(/g,
  
  /** matchMedia usage */
  matchMedia: /matchMedia\s*\(/g,
  
  /** window.innerWidth checks */
  windowInnerWidth: /window\.innerWidth/g,
  
  /** CSS-in-JS media queries (styled-components, emotion) */
  cssInJsMedia: /\$\{[^}]*media[^}]*\}|@media|breakpoints?\./gi,
};

/**
 * Patterns for detecting responsive components.
 */
const RESPONSIVE_COMPONENT_PATTERNS = {
  /** Responsive container components */
  responsiveContainer: /<(?:Container|Box|Grid|Flex|Stack)[^>]*(?:responsive|breakpoint|mobile)/gi,
  
  /** Hidden/visible on breakpoints */
  hiddenVisible: /\b(?:hidden|block|flex|grid|inline)\s+(?:sm:|md:|lg:|xl:|2xl:)/g,
  
  /** Responsive grid columns */
  responsiveGrid: /grid-cols-\d+\s+(?:sm:|md:|lg:|xl:|2xl:)grid-cols-/g,
  
  /** Responsive flex direction */
  responsiveFlex: /flex-(?:col|row)\s+(?:sm:|md:|lg:|xl:|2xl:)flex-/g,
  
  /** Mobile-specific components */
  mobileComponent: /<(?:Mobile|MobileOnly|MobileView|MobileNav|MobileMenu)[^>]*>/gi,
  
  /** Desktop-specific components */
  desktopComponent: /<(?:Desktop|DesktopOnly|DesktopView)[^>]*>/gi,
};

/**
 * Patterns for detecting fixed width issues.
 */
const FIXED_WIDTH_PATTERNS = {
  /** Fixed pixel widths in className */
  fixedWidthClass: /\bw-\[(\d+)px\]/g,
  
  /** Fixed pixel widths in style prop */
  fixedWidthStyle: /width:\s*['"]?(\d+)px['"]?/gi,
  
  /** Fixed pixel widths in inline style object */
  fixedWidthInline: /width:\s*(\d+)/g,
  
  /** Fixed min-width */
  fixedMinWidth: /min-w-\[(\d+)px\]|minWidth:\s*['"]?(\d+)px['"]?/gi,
  
  /** Fixed max-width that's too small */
  fixedMaxWidth: /max-w-\[(\d+)px\]|maxWidth:\s*['"]?(\d+)px['"]?/gi,
  
  /** Hardcoded pixel values in style */
  hardcodedPixels: /style=\{[^}]*\d{3,}[^}]*\}/g,
};

/**
 * Patterns for detecting touch target issues.
 */
const TOUCH_TARGET_PATTERNS = {
  /** Small button/link sizes */
  smallTouchTarget: /\b(?:w-[1-7]|h-[1-7]|p-[0-1]|px-[0-1]|py-[0-1])\b/g,
  
  /** Small icon buttons */
  smallIconButton: /<(?:button|Button|IconButton)[^>]*(?:size=['"](?:xs|sm)['"]|className=['"][^'"]*(?:w-[1-6]|h-[1-6])[^'"]*['"])/gi,
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Gets line number from character index in content.
 */
function getLineNumber(content: string, index: number): number {
  const beforeMatch = content.substring(0, index);
  return (beforeMatch.match(/\n/g) || []).length + 1;
}

/**
 * Extracts a code snippet around a given index.
 */
function extractCodeSnippet(content: string, index: number, contextLines: number = 1): string {
  const lines = content.split('\n');
  const lineNumber = getLineNumber(content, index);
  const startLine = Math.max(0, lineNumber - contextLines - 1);
  const endLine = Math.min(lines.length, lineNumber + contextLines);
  
  return lines.slice(startLine, endLine).join('\n').trim();
}

/**
 * Creates evidence for a mobile issue.
 */
function createEvidence(
  filePath: string,
  lineNumbers: number[],
  codeSnippet: string,
  reason: string,
  confidence: 'certain' | 'likely' | 'possible'
): Evidence {
  return {
    filePath,
    lineNumbers,
    codeSnippet: codeSnippet.substring(0, 500), // Limit snippet length
    reason,
    confidence,
  };
}

/**
 * Counts matches of a pattern in content.
 */
function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(new RegExp(pattern.source, 'g'));
  return matches ? matches.length : 0;
}


// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detects Tailwind responsive patterns in the content.
 */
function detectTailwindResponsivePatterns(content: string): ResponsivePattern[] {
  const patterns: ResponsivePattern[] = [];
  const seenLines = new Set<number>();
  
  // Detect each breakpoint
  for (const [breakpoint, regex] of Object.entries(TAILWIND_RESPONSIVE_PATTERNS)) {
    const pattern = new RegExp(regex.source, 'g');
    let match: RegExpExecArray | null;
    
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      const key = `${breakpoint}-${lineNumber}`;
      
      if (!seenLines.has(lineNumber)) {
        seenLines.add(lineNumber);
        
        patterns.push({
          type: `tailwind-${breakpoint}` as ResponsivePatternType,
          lineNumber,
          codeSnippet: extractCodeSnippet(content, match.index),
          breakpoint,
        });
      }
    }
  }
  
  return patterns;
}

/**
 * Detects media query patterns in the content.
 */
function detectMediaQueryPatterns(content: string): ResponsivePattern[] {
  const patterns: ResponsivePattern[] = [];
  const seenLines = new Set<number>();
  
  // CSS media queries
  const cssMediaRegex = new RegExp(MEDIA_QUERY_PATTERNS.cssMediaQuery.source, 'g');
  let match: RegExpExecArray | null;
  
  while ((match = cssMediaRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      patterns.push({
        type: 'media-query',
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
      });
    }
  }
  
  // useMediaQuery hook
  const useMediaQueryRegex = new RegExp(MEDIA_QUERY_PATTERNS.useMediaQueryHook.source, 'g');
  while ((match = useMediaQueryRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      patterns.push({
        type: 'css-in-js-media',
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
      });
    }
  }
  
  // matchMedia
  const matchMediaRegex = new RegExp(MEDIA_QUERY_PATTERNS.matchMedia.source, 'g');
  while ((match = matchMediaRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      patterns.push({
        type: 'css-in-js-media',
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
      });
    }
  }
  
  // window.innerWidth checks
  const windowWidthRegex = new RegExp(MEDIA_QUERY_PATTERNS.windowInnerWidth.source, 'g');
  while ((match = windowWidthRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      patterns.push({
        type: 'css-in-js-media',
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
      });
    }
  }
  
  return patterns;
}

/**
 * Detects responsive component patterns in the content.
 */
function detectResponsiveComponentPatterns(content: string): ResponsivePattern[] {
  const patterns: ResponsivePattern[] = [];
  const seenLines = new Set<number>();
  
  // Mobile-specific components
  const mobileComponentRegex = new RegExp(RESPONSIVE_COMPONENT_PATTERNS.mobileComponent.source, 'gi');
  let match: RegExpExecArray | null;
  
  while ((match = mobileComponentRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      patterns.push({
        type: 'mobile-specific',
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
      });
    }
  }
  
  // Desktop-specific components (indicates responsive awareness)
  const desktopComponentRegex = new RegExp(RESPONSIVE_COMPONENT_PATTERNS.desktopComponent.source, 'gi');
  while ((match = desktopComponentRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      patterns.push({
        type: 'responsive-component',
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
      });
    }
  }
  
  // Hidden/visible patterns
  const hiddenVisibleRegex = new RegExp(RESPONSIVE_COMPONENT_PATTERNS.hiddenVisible.source, 'g');
  while ((match = hiddenVisibleRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      patterns.push({
        type: 'responsive-component',
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
      });
    }
  }
  
  return patterns;
}

/**
 * Detects fixed width elements that may cause mobile issues.
 */
function detectFixedWidthElements(content: string, filePath: string): FixedWidthElement[] {
  const elements: FixedWidthElement[] = [];
  const seenLines = new Set<number>();
  
  // Fixed pixel widths in className
  const fixedWidthClassRegex = new RegExp(FIXED_WIDTH_PATTERNS.fixedWidthClass.source, 'g');
  let match: RegExpExecArray | null;
  
  while ((match = fixedWidthClassRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const widthValue = match[1];
      const numericWidth = parseInt(widthValue, 10);
      
      elements.push({
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
        widthValue: `${widthValue}px`,
        isProblematic: numericWidth > 320, // Problematic if wider than small mobile
      });
    }
  }
  
  // Fixed pixel widths in style prop
  const fixedWidthStyleRegex = new RegExp(FIXED_WIDTH_PATTERNS.fixedWidthStyle.source, 'gi');
  while ((match = fixedWidthStyleRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const widthValue = match[1];
      const numericWidth = parseInt(widthValue, 10);
      
      elements.push({
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
        widthValue: `${widthValue}px`,
        isProblematic: numericWidth > 320,
      });
    }
  }
  
  return elements;
}


/**
 * Detects mobile issues in the content.
 */
function detectMobileIssues(
  content: string,
  filePath: string,
  fixedWidthElements: FixedWidthElement[],
  hasResponsivePatterns: boolean
): MobileIssue[] {
  const issues: MobileIssue[] = [];
  
  // Issue: Fixed widths that are too large for mobile
  for (const element of fixedWidthElements) {
    if (element.isProblematic) {
      issues.push({
        type: 'fixed-width',
        lineNumber: element.lineNumber,
        codeSnippet: element.codeSnippet,
        description: `Fixed width of ${element.widthValue} may cause horizontal scrolling on mobile devices`,
        severity: 'medium',
        evidence: createEvidence(
          filePath,
          [element.lineNumber],
          element.codeSnippet,
          `Fixed width ${element.widthValue} exceeds typical mobile viewport width`,
          'likely'
        ),
      });
    }
  }
  
  // Issue: No responsive classes at all
  if (!hasResponsivePatterns) {
    // Check if the file has any className attributes (indicating it's a styled component)
    const hasClassNames = /className\s*=/.test(content);
    const hasStyles = /style\s*=/.test(content);
    
    if (hasClassNames || hasStyles) {
      issues.push({
        type: 'no-responsive-classes',
        lineNumber: 1,
        codeSnippet: '',
        description: 'No responsive Tailwind classes or media queries detected in this component',
        severity: 'low',
        evidence: createEvidence(
          filePath,
          [1],
          '',
          'Component has styling but no responsive breakpoint handling',
          'possible'
        ),
      });
    }
  }
  
  // Issue: Small touch targets
  const smallTouchRegex = new RegExp(TOUCH_TARGET_PATTERNS.smallTouchTarget.source, 'g');
  let match: RegExpExecArray | null;
  const seenTouchLines = new Set<number>();
  
  while ((match = smallTouchRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    
    // Check if this is on a button or interactive element
    const contextStart = Math.max(0, match.index - 100);
    const contextEnd = Math.min(content.length, match.index + 100);
    const context = content.substring(contextStart, contextEnd);
    
    if (/button|Button|onClick|href|Link/i.test(context) && !seenTouchLines.has(lineNumber)) {
      seenTouchLines.add(lineNumber);
      issues.push({
        type: 'touch-target-small',
        lineNumber,
        codeSnippet: extractCodeSnippet(content, match.index),
        description: 'Interactive element may have touch target smaller than recommended 44x44px',
        severity: 'low',
        evidence: createEvidence(
          filePath,
          [lineNumber],
          extractCodeSnippet(content, match.index),
          'Small size classes on interactive element may cause touch accessibility issues',
          'possible'
        ),
      });
    }
  }
  
  return issues;
}

/**
 * Calculates breakpoint statistics from responsive patterns.
 */
function calculateBreakpointStats(content: string): BreakpointStats {
  return {
    sm: countMatches(content, TAILWIND_RESPONSIVE_PATTERNS.sm),
    md: countMatches(content, TAILWIND_RESPONSIVE_PATTERNS.md),
    lg: countMatches(content, TAILWIND_RESPONSIVE_PATTERNS.lg),
    xl: countMatches(content, TAILWIND_RESPONSIVE_PATTERNS.xl),
    '2xl': countMatches(content, TAILWIND_RESPONSIVE_PATTERNS['2xl']),
    total: 
      countMatches(content, TAILWIND_RESPONSIVE_PATTERNS.sm) +
      countMatches(content, TAILWIND_RESPONSIVE_PATTERNS.md) +
      countMatches(content, TAILWIND_RESPONSIVE_PATTERNS.lg) +
      countMatches(content, TAILWIND_RESPONSIVE_PATTERNS.xl) +
      countMatches(content, TAILWIND_RESPONSIVE_PATTERNS['2xl']),
  };
}

/**
 * Determines if the page uses mobile-first approach.
 * Mobile-first means base styles are for mobile, with breakpoints adding desktop styles.
 */
function checkMobileFirstApproach(content: string, breakpointStats: BreakpointStats): boolean {
  // If there are responsive classes, check if they follow mobile-first pattern
  if (breakpointStats.total === 0) {
    return false;
  }
  
  // Mobile-first typically has more sm/md classes than xl/2xl
  // because you're progressively enhancing for larger screens
  const smallBreakpoints = breakpointStats.sm + breakpointStats.md;
  const largeBreakpoints = breakpointStats.xl + breakpointStats['2xl'];
  
  // Also check for common mobile-first patterns
  const hasMobileFirstPatterns = 
    /\bflex-col\s+(?:sm:|md:)flex-row/.test(content) ||
    /\bw-full\s+(?:sm:|md:|lg:)w-/.test(content) ||
    /\bhidden\s+(?:sm:|md:|lg:)(?:block|flex|grid)/.test(content) ||
    /\bblock\s+(?:sm:|md:|lg:)hidden/.test(content);
  
  return hasMobileFirstPatterns || smallBreakpoints >= largeBreakpoints;
}

/**
 * Extracts unique responsive pattern types from patterns.
 */
function extractResponsivePatternTypes(patterns: ResponsivePattern[]): ResponsivePatternType[] {
  const types = new Set<ResponsivePatternType>();
  patterns.forEach(p => types.add(p.type));
  return Array.from(types);
}


// =============================================================================
// Main Detection Functions
// =============================================================================

/**
 * Checks mobile responsiveness in a single page file.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns MobileResponsivenessResult with verification details
 * 
 * **Validates: Requirements 2.7, 7.1**
 */
export function checkMobileResponsiveness(
  filePath: string,
  baseDir: string = process.cwd()
): MobileResponsivenessResult {
  const fullPath = path.join(baseDir, filePath);
  
  // Default result for files that can't be read
  const defaultResult: MobileResponsivenessResult = {
    isMobileResponsive: false,
    responsivePatternTypes: [],
    issues: [],
    responsivePatternCount: 0,
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        issues: [`File not found: ${filePath}`],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect all responsive patterns
    const tailwindPatterns = detectTailwindResponsivePatterns(content);
    const mediaQueryPatterns = detectMediaQueryPatterns(content);
    const responsiveComponentPatterns = detectResponsiveComponentPatterns(content);
    
    // Combine all patterns
    const allPatterns = [
      ...tailwindPatterns,
      ...mediaQueryPatterns,
      ...responsiveComponentPatterns,
    ];
    
    // Detect fixed width elements
    const fixedWidthElements = detectFixedWidthElements(content, filePath);
    
    // Detect mobile issues
    const hasResponsivePatterns = allPatterns.length > 0;
    const mobileIssues = detectMobileIssues(content, filePath, fixedWidthElements, hasResponsivePatterns);
    
    // Determine if mobile responsive
    const isMobileResponsive = hasResponsivePatterns && 
      mobileIssues.filter(i => i.severity === 'high').length === 0;
    
    // Convert issues to strings
    const issueStrings = mobileIssues.map(i => 
      `[${i.severity.toUpperCase()}] Line ${i.lineNumber}: ${i.description}`
    );
    
    return {
      isMobileResponsive,
      responsivePatternTypes: extractResponsivePatternTypes(allPatterns),
      issues: issueStrings,
      responsivePatternCount: allPatterns.length,
    };
  } catch (error) {
    return {
      ...defaultResult,
      issues: [error instanceof Error ? error.message : 'Unknown error reading file'],
    };
  }
}

/**
 * Checks mobile responsiveness with extended details for analysis.
 * 
 * @param filePath - Path to the page file (relative to project root)
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns ExtendedMobileResponsivenessResult with detailed verification information
 * 
 * **Validates: Requirements 2.7, 7.1**
 */
export function checkMobileResponsivenessExtended(
  filePath: string,
  baseDir: string = process.cwd()
): ExtendedMobileResponsivenessResult {
  const fullPath = path.join(baseDir, filePath);
  
  // Default result for files that can't be read
  const defaultResult: ExtendedMobileResponsivenessResult = {
    isMobileResponsive: false,
    responsivePatternTypes: [],
    issues: [],
    responsivePatternCount: 0,
    responsivePatterns: [],
    mobileIssues: [],
    breakpointStats: { sm: 0, md: 0, lg: 0, xl: 0, '2xl': 0, total: 0 },
    usesMobileFirst: false,
    fixedWidthElements: [],
  };
  
  try {
    if (!fs.existsSync(fullPath)) {
      return {
        ...defaultResult,
        issues: [`File not found: ${filePath}`],
      };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Detect all responsive patterns
    const tailwindPatterns = detectTailwindResponsivePatterns(content);
    const mediaQueryPatterns = detectMediaQueryPatterns(content);
    const responsiveComponentPatterns = detectResponsiveComponentPatterns(content);
    
    // Combine all patterns
    const allPatterns = [
      ...tailwindPatterns,
      ...mediaQueryPatterns,
      ...responsiveComponentPatterns,
    ];
    
    // Calculate breakpoint statistics
    const breakpointStats = calculateBreakpointStats(content);
    
    // Check for mobile-first approach
    const usesMobileFirst = checkMobileFirstApproach(content, breakpointStats);
    
    // Detect fixed width elements
    const fixedWidthElements = detectFixedWidthElements(content, filePath);
    
    // Detect mobile issues
    const hasResponsivePatterns = allPatterns.length > 0;
    const mobileIssues = detectMobileIssues(content, filePath, fixedWidthElements, hasResponsivePatterns);
    
    // Determine if mobile responsive
    const isMobileResponsive = hasResponsivePatterns && 
      mobileIssues.filter(i => i.severity === 'high').length === 0;
    
    // Convert issues to strings
    const issueStrings = mobileIssues.map(i => 
      `[${i.severity.toUpperCase()}] Line ${i.lineNumber}: ${i.description}`
    );
    
    return {
      isMobileResponsive,
      responsivePatternTypes: extractResponsivePatternTypes(allPatterns),
      issues: issueStrings,
      responsivePatternCount: allPatterns.length,
      responsivePatterns: allPatterns,
      mobileIssues,
      breakpointStats,
      usesMobileFirst,
      fixedWidthElements,
    };
  } catch (error) {
    return {
      ...defaultResult,
      issues: [error instanceof Error ? error.message : 'Unknown error reading file'],
    };
  }
}

/**
 * Checks mobile responsiveness for multiple page files.
 * 
 * @param filePaths - Array of file paths to check
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns Map of file paths to MobileResponsivenessResult
 */
export function checkMobileResponsivenessMultiple(
  filePaths: string[],
  baseDir: string = process.cwd()
): Map<string, MobileResponsivenessResult> {
  const results = new Map<string, MobileResponsivenessResult>();
  
  for (const filePath of filePaths) {
    results.set(filePath, checkMobileResponsiveness(filePath, baseDir));
  }
  
  return results;
}


// =============================================================================
// Report Generation
// =============================================================================

/**
 * Gets a summary of mobile responsiveness check for a file.
 * 
 * @param filePath - Path to the file
 * @param result - MobileResponsivenessResult or ExtendedMobileResponsivenessResult to summarize
 * @returns Human-readable summary string
 */
export function getMobileResponsivenessSummary(
  filePath: string,
  result: MobileResponsivenessResult | ExtendedMobileResponsivenessResult
): string {
  const lines: string[] = [];
  
  lines.push(`File: ${filePath}`);
  lines.push(`  Mobile Responsive: ${result.isMobileResponsive ? '✓ Yes' : '✗ No'}`);
  lines.push(`  Responsive Patterns Found: ${result.responsivePatternCount}`);
  
  if (result.responsivePatternTypes.length > 0) {
    lines.push(`  Pattern Types: ${result.responsivePatternTypes.join(', ')}`);
  }
  
  // Check for extended result properties
  if ('breakpointStats' in result) {
    const stats = result.breakpointStats;
    if (stats.total > 0) {
      lines.push(`  Breakpoint Usage:`);
      if (stats.sm > 0) lines.push(`    - sm: ${stats.sm}`);
      if (stats.md > 0) lines.push(`    - md: ${stats.md}`);
      if (stats.lg > 0) lines.push(`    - lg: ${stats.lg}`);
      if (stats.xl > 0) lines.push(`    - xl: ${stats.xl}`);
      if (stats['2xl'] > 0) lines.push(`    - 2xl: ${stats['2xl']}`);
    }
    
    lines.push(`  Mobile-First Approach: ${result.usesMobileFirst ? '✓ Yes' : '✗ No'}`);
    
    if (result.fixedWidthElements.length > 0) {
      const problematic = result.fixedWidthElements.filter(e => e.isProblematic);
      lines.push(`  Fixed Width Elements: ${result.fixedWidthElements.length} (${problematic.length} problematic)`);
    }
  }
  
  if (result.issues.length > 0) {
    lines.push(`  Issues:`);
    for (const issue of result.issues) {
      lines.push(`    - ${issue}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Generates a report of mobile responsiveness checks for all pages.
 * 
 * @param results - Map of file paths to MobileResponsivenessResult
 * @returns Formatted report string
 */
export function generateMobileResponsivenessReport(
  results: Map<string, MobileResponsivenessResult | ExtendedMobileResponsivenessResult>
): string {
  const lines: string[] = [];
  const responsivePages: [string, MobileResponsivenessResult | ExtendedMobileResponsivenessResult][] = [];
  const nonResponsivePages: [string, MobileResponsivenessResult | ExtendedMobileResponsivenessResult][] = [];
  const pagesWithIssues: [string, MobileResponsivenessResult | ExtendedMobileResponsivenessResult][] = [];
  
  // Categorize pages
  for (const [filePath, result] of results) {
    if (result.isMobileResponsive) {
      responsivePages.push([filePath, result]);
    } else {
      nonResponsivePages.push([filePath, result]);
    }
    
    if (result.issues.length > 0) {
      pagesWithIssues.push([filePath, result]);
    }
  }
  
  lines.push('='.repeat(60));
  lines.push('Mobile Responsiveness Verification Report');
  lines.push('='.repeat(60));
  lines.push('');
  
  lines.push(`Total Pages Analyzed: ${results.size}`);
  lines.push(`Mobile Responsive Pages: ${responsivePages.length}`);
  lines.push(`Non-Responsive Pages: ${nonResponsivePages.length}`);
  lines.push(`Pages with Issues: ${pagesWithIssues.length}`);
  lines.push('');
  
  // Aggregate breakpoint statistics
  let totalSm = 0, totalMd = 0, totalLg = 0, totalXl = 0, total2xl = 0;
  let mobileFirstCount = 0;
  
  for (const [, result] of results) {
    if ('breakpointStats' in result) {
      totalSm += result.breakpointStats.sm;
      totalMd += result.breakpointStats.md;
      totalLg += result.breakpointStats.lg;
      totalXl += result.breakpointStats.xl;
      total2xl += result.breakpointStats['2xl'];
      if (result.usesMobileFirst) mobileFirstCount++;
    }
  }
  
  const totalBreakpoints = totalSm + totalMd + totalLg + totalXl + total2xl;
  if (totalBreakpoints > 0) {
    lines.push('Aggregate Breakpoint Usage:');
    lines.push(`  - sm: ${totalSm} (${((totalSm / totalBreakpoints) * 100).toFixed(1)}%)`);
    lines.push(`  - md: ${totalMd} (${((totalMd / totalBreakpoints) * 100).toFixed(1)}%)`);
    lines.push(`  - lg: ${totalLg} (${((totalLg / totalBreakpoints) * 100).toFixed(1)}%)`);
    lines.push(`  - xl: ${totalXl} (${((totalXl / totalBreakpoints) * 100).toFixed(1)}%)`);
    lines.push(`  - 2xl: ${total2xl} (${((total2xl / totalBreakpoints) * 100).toFixed(1)}%)`);
    lines.push('');
    lines.push(`Pages Using Mobile-First Approach: ${mobileFirstCount}/${results.size}`);
    lines.push('');
  }
  
  if (nonResponsivePages.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('Non-Responsive Pages (Need Attention):');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of nonResponsivePages) {
      lines.push('');
      lines.push(getMobileResponsivenessSummary(filePath, result));
    }
  }
  
  if (pagesWithIssues.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('Pages with Mobile Issues:');
    lines.push('-'.repeat(60));
    
    for (const [filePath, result] of pagesWithIssues) {
      // Skip if already shown in non-responsive section
      if (!nonResponsivePages.some(([p]) => p === filePath)) {
        lines.push('');
        lines.push(getMobileResponsivenessSummary(filePath, result));
      }
    }
  }
  
  return lines.join('\n');
}


// =============================================================================
// CLI Execution Support
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const testFile = process.argv[2] || 'src/pages/student/Dashboard.tsx';
  
  console.log('Mobile Responsiveness Checker');
  console.log('=============================');
  console.log(`Analyzing: ${testFile}`);
  console.log('');
  
  const result = checkMobileResponsivenessExtended(testFile);
  console.log(getMobileResponsivenessSummary(testFile, result));
  
  if (result.responsivePatterns.length > 0) {
    console.log('\n\nResponsive Patterns Detected:');
    console.log('-----------------------------');
    
    // Group by type
    const patternsByType = new Map<ResponsivePatternType, ResponsivePattern[]>();
    for (const pattern of result.responsivePatterns) {
      const existing = patternsByType.get(pattern.type) || [];
      existing.push(pattern);
      patternsByType.set(pattern.type, existing);
    }
    
    for (const [type, patterns] of patternsByType) {
      console.log(`\n  ${type}: ${patterns.length} occurrences`);
      // Show first 3 examples
      for (const pattern of patterns.slice(0, 3)) {
        console.log(`    Line ${pattern.lineNumber}`);
      }
      if (patterns.length > 3) {
        console.log(`    ... and ${patterns.length - 3} more`);
      }
    }
  }
  
  if (result.fixedWidthElements.length > 0) {
    console.log('\n\nFixed Width Elements:');
    console.log('---------------------');
    for (const element of result.fixedWidthElements) {
      const status = element.isProblematic ? '⚠️ PROBLEMATIC' : '✓ OK';
      console.log(`  Line ${element.lineNumber}: ${element.widthValue} ${status}`);
    }
  }
  
  if (result.mobileIssues.length > 0) {
    console.log('\n\nMobile Issues Detected:');
    console.log('-----------------------');
    for (const issue of result.mobileIssues) {
      console.log(`  [${issue.severity.toUpperCase()}] Line ${issue.lineNumber}: ${issue.description}`);
    }
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(50));
  console.log('Summary');
  console.log('='.repeat(50));
  console.log(`Mobile Responsive: ${result.isMobileResponsive ? '✓ YES' : '✗ NO'}`);
  console.log(`Mobile-First Approach: ${result.usesMobileFirst ? '✓ YES' : '✗ NO'}`);
  console.log(`Total Responsive Patterns: ${result.responsivePatternCount}`);
  console.log(`Total Issues: ${result.issues.length}`);
  
  if (result.breakpointStats.total > 0) {
    console.log(`\nBreakpoint Distribution:`);
    const stats = result.breakpointStats;
    const total = stats.total;
    console.log(`  sm: ${stats.sm} (${((stats.sm / total) * 100).toFixed(0)}%)`);
    console.log(`  md: ${stats.md} (${((stats.md / total) * 100).toFixed(0)}%)`);
    console.log(`  lg: ${stats.lg} (${((stats.lg / total) * 100).toFixed(0)}%)`);
    console.log(`  xl: ${stats.xl} (${((stats.xl / total) * 100).toFixed(0)}%)`);
    console.log(`  2xl: ${stats['2xl']} (${((stats['2xl'] / total) * 100).toFixed(0)}%)`);
  }
}
