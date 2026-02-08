/**
 * Animation Scanner for MIHAS Frontend-Backend Forensic Audit
 * 
 * Scans the codebase for animation usage including:
 * - framer-motion imports and usage
 * - Heavy CSS animations (keyframes, complex transitions)
 * - Custom animation implementations
 * 
 * Identifies heavy animations that may impact performance on low-end mobile devices.
 * 
 * @requirements 7.2 - IF heavy animations exist THEN the Audit_System SHALL flag them for removal
 * 
 * Property 20: Heavy Animation Flagging
 * *For any* animation using heavy libraries (framer-motion) or complex CSS animations,
 * the Performance Auditor SHALL flag it for removal or optimization.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AnimationUsage, AnimationLibrary, PerformanceIssue } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended animation usage with line number information.
 */
export interface ExtendedAnimationUsage extends AnimationUsage {
  /** Line number where the animation is used */
  lineNumber: number;
  /** Code snippet showing the animation usage */
  codeSnippet: string;
  /** Specific animation type detected */
  animationType: AnimationDetectionType;
}

/**
 * Types of animations that can be detected.
 */
export type AnimationDetectionType =
  | 'framer-motion-import'
  | 'framer-motion-component'
  | 'framer-motion-hook'
  | 'css-keyframes'
  | 'css-animation-property'
  | 'css-transition-complex'
  | 'css-transform-animated'
  | 'gsap-import'
  | 'react-spring-import'
  | 'anime-js-import'
  | 'lottie-import'
  | 'custom-animation';

/**
 * Result of scanning for animations.
 */
export interface AnimationScanResult {
  /** All animation usages found */
  animations: ExtendedAnimationUsage[];
  /** Total number of animations found */
  totalAnimations: number;
  /** Number of heavy animations */
  heavyAnimationCount: number;
  /** Performance issues related to animations */
  performanceIssues: PerformanceIssue[];
  /** Summary by library type */
  libraryBreakdown: Record<AnimationLibrary, number>;
  /** Files with framer-motion imports */
  framerMotionFiles: string[];
  /** Any errors encountered during scanning */
  errors: { filePath: string; error: string }[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Files/directories to exclude from scanning.
 */
const EXCLUDED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.kiro',
  'forensic_reports',
];

/**
 * Patterns for detecting framer-motion usage.
 */
const FRAMER_MOTION_PATTERNS = {
  /** Import statement for framer-motion */
  import: /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]framer-motion['"]/g,
  
  /** motion.* component usage */
  motionComponent: /<motion\.(\w+)/g,
  
  /** AnimatePresence component */
  animatePresence: /<AnimatePresence/g,
  
  /** useAnimation hook */
  useAnimation: /useAnimation\s*\(/g,
  
  /** useMotionValue hook */
  useMotionValue: /useMotionValue\s*\(/g,
  
  /** useSpring hook */
  useSpring: /useSpring\s*\(/g,
  
  /** useTransform hook */
  useTransform: /useTransform\s*\(/g,
  
  /** animate prop */
  animateProp: /animate\s*=\s*\{/g,
  
  /** variants prop */
  variantsProp: /variants\s*=\s*\{/g,
  
  /** whileHover, whileTap, etc. */
  whileProps: /while(?:Hover|Tap|Focus|Drag|InView)\s*=\s*\{/g,
  
  /** transition prop with complex config */
  transitionProp: /transition\s*=\s*\{[^}]*(?:duration|delay|ease|type|stiffness|damping)[^}]*\}/g,
};

/**
 * Patterns for detecting heavy CSS animations.
 */
const CSS_ANIMATION_PATTERNS = {
  /** @keyframes definition */
  keyframes: /@keyframes\s+[\w-]+\s*\{/g,
  
  /** animation property with multiple values */
  animationProperty: /animation\s*:\s*[^;]+(?:infinite|alternate|ease-in-out|cubic-bezier)[^;]*/gi,
  
  /** animation-name property */
  animationName: /animation-name\s*:\s*[\w-]+/gi,
  
  /** Complex transitions (multiple properties or long duration) */
  complexTransition: /transition\s*:\s*(?:all|transform|opacity)[^;]*(?:\d{3,}ms|\d+s)[^;]*/gi,
  
  /** Tailwind animate-* classes */
  tailwindAnimate: /\banimate-(?:spin|ping|pulse|bounce)\b/g,
  
  /** CSS transform with animation */
  transformAnimated: /transform\s*:\s*[^;]*(?:rotate|scale|translate|skew)[^;]*/gi,
  
  /** will-change property (indicates animation intent) */
  willChange: /will-change\s*:\s*(?!auto)[^;]+/gi,
};

/**
 * Patterns for detecting other animation libraries.
 */
const OTHER_ANIMATION_LIBRARY_PATTERNS = {
  /** GSAP import */
  gsap: /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]gsap['"]/g,
  
  /** react-spring import */
  reactSpring: /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"](?:@react-spring\/web|react-spring)['"]/g,
  
  /** anime.js import */
  animeJs: /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]animejs['"]/g,
  
  /** Lottie import */
  lottie: /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"](?:lottie-react|@lottiefiles\/react-lottie-player|lottie-web)['"]/g,
};

/**
 * Recommendations for different animation types.
 */
const ANIMATION_RECOMMENDATIONS: Record<AnimationDetectionType, string> = {
  'framer-motion-import': 'Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.',
  'framer-motion-component': 'Replace motion.* components with standard HTML elements and CSS transitions.',
  'framer-motion-hook': 'Replace framer-motion hooks with CSS animations or requestAnimationFrame.',
  'css-keyframes': 'Review keyframe animation complexity. Consider simplifying or using transform-only animations.',
  'css-animation-property': 'Ensure animation uses GPU-accelerated properties (transform, opacity) only.',
  'css-transition-complex': 'Simplify transition. Avoid transitioning multiple properties simultaneously.',
  'css-transform-animated': 'Ensure transform animations use will-change sparingly and are GPU-accelerated.',
  'gsap-import': 'Consider removing GSAP for simpler CSS animations to reduce bundle size.',
  'react-spring-import': 'Consider removing react-spring for simpler CSS animations to reduce bundle size.',
  'anime-js-import': 'Consider removing anime.js for simpler CSS animations to reduce bundle size.',
  'lottie-import': 'Lottie animations can be heavy. Ensure they are lazy-loaded and optimized.',
  'custom-animation': 'Review custom animation implementation for performance impact.',
};

// =============================================================================
// Helper Functions
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
  
  return lines.slice(startLine, endLine).join('\n').trim().substring(0, 300);
}

/**
 * Recursively finds all .tsx, .ts, .css, and .scss files in a directory.
 */
function findSourceFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    // Skip excluded paths
    if (EXCLUDED_PATHS.includes(entry.name)) {
      continue;
    }
    
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findSourceFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      // Include TypeScript, JavaScript, CSS, and SCSS files
      if (['.tsx', '.ts', '.jsx', '.js', '.css', '.scss'].includes(ext)) {
        // Skip test files and type definition files
        if (!entry.name.includes('.test.') && !entry.name.endsWith('.d.ts')) {
          const relativePath = path.relative(baseDir, fullPath);
          files.push(relativePath);
        }
      }
    }
  }
  
  return files;
}

/**
 * Determines if an animation is heavy based on its type and context.
 */
function isHeavyAnimation(type: AnimationDetectionType, codeSnippet: string): boolean {
  // framer-motion is always considered heavy due to bundle size
  if (type.startsWith('framer-motion')) {
    return true;
  }
  
  // Other animation libraries are heavy
  if (['gsap-import', 'react-spring-import', 'anime-js-import', 'lottie-import'].includes(type)) {
    return true;
  }
  
  // CSS keyframes with many steps or complex timing
  if (type === 'css-keyframes') {
    // Check for many percentage stops or complex animations
    const percentageStops = (codeSnippet.match(/\d+%/g) || []).length;
    return percentageStops > 4;
  }
  
  // Complex transitions
  if (type === 'css-transition-complex') {
    // Check for long durations or multiple properties
    const hasLongDuration = /(?:\d{4,}ms|\d+(?:\.\d+)?s)/.test(codeSnippet);
    const hasAllTransition = /transition\s*:\s*all/.test(codeSnippet);
    return hasLongDuration || hasAllTransition;
  }
  
  // Infinite animations
  if (type === 'css-animation-property') {
    return /infinite/.test(codeSnippet);
  }
  
  return false;
}

/**
 * Determines the library type for an animation.
 */
function determineLibrary(type: AnimationDetectionType): AnimationLibrary {
  if (type.startsWith('framer-motion')) {
    return 'framer-motion';
  }
  if (type.startsWith('css-') || type === 'custom-animation') {
    return 'css';
  }
  return 'custom';
}

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detects framer-motion usage in file content.
 */
function detectFramerMotion(content: string, filePath: string): ExtendedAnimationUsage[] {
  const animations: ExtendedAnimationUsage[] = [];
  const seenLines = new Set<number>();
  
  // Check for import
  const importRegex = new RegExp(FRAMER_MOTION_PATTERNS.import.source, 'g');
  let match: RegExpExecArray | null;
  
  while ((match = importRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const codeSnippet = extractCodeSnippet(content, match.index);
      animations.push({
        filePath,
        library: 'framer-motion',
        isHeavy: true,
        recommendation: ANIMATION_RECOMMENDATIONS['framer-motion-import'],
        lineNumber,
        codeSnippet,
        animationType: 'framer-motion-import',
      });
    }
  }
  
  // Check for motion.* components
  const motionComponentRegex = new RegExp(FRAMER_MOTION_PATTERNS.motionComponent.source, 'g');
  while ((match = motionComponentRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const codeSnippet = extractCodeSnippet(content, match.index);
      animations.push({
        filePath,
        library: 'framer-motion',
        isHeavy: true,
        recommendation: ANIMATION_RECOMMENDATIONS['framer-motion-component'],
        lineNumber,
        codeSnippet,
        animationType: 'framer-motion-component',
      });
    }
  }
  
  // Check for AnimatePresence
  const animatePresenceRegex = new RegExp(FRAMER_MOTION_PATTERNS.animatePresence.source, 'g');
  while ((match = animatePresenceRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const codeSnippet = extractCodeSnippet(content, match.index);
      animations.push({
        filePath,
        library: 'framer-motion',
        isHeavy: true,
        recommendation: ANIMATION_RECOMMENDATIONS['framer-motion-component'],
        lineNumber,
        codeSnippet,
        animationType: 'framer-motion-component',
      });
    }
  }
  
  // Check for framer-motion hooks
  const hookPatterns = [
    FRAMER_MOTION_PATTERNS.useAnimation,
    FRAMER_MOTION_PATTERNS.useMotionValue,
    FRAMER_MOTION_PATTERNS.useSpring,
    FRAMER_MOTION_PATTERNS.useTransform,
  ];
  
  for (const pattern of hookPatterns) {
    const hookRegex = new RegExp(pattern.source, 'g');
    while ((match = hookRegex.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      if (!seenLines.has(lineNumber)) {
        seenLines.add(lineNumber);
        const codeSnippet = extractCodeSnippet(content, match.index);
        animations.push({
          filePath,
          library: 'framer-motion',
          isHeavy: true,
          recommendation: ANIMATION_RECOMMENDATIONS['framer-motion-hook'],
          lineNumber,
          codeSnippet,
          animationType: 'framer-motion-hook',
        });
      }
    }
  }
  
  return animations;
}

/**
 * Detects CSS animation usage in file content.
 */
function detectCSSAnimations(content: string, filePath: string): ExtendedAnimationUsage[] {
  const animations: ExtendedAnimationUsage[] = [];
  const seenLines = new Set<number>();
  
  // Check for @keyframes
  const keyframesRegex = new RegExp(CSS_ANIMATION_PATTERNS.keyframes.source, 'g');
  let match: RegExpExecArray | null;
  
  while ((match = keyframesRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const codeSnippet = extractCodeSnippet(content, match.index, 3);
      const isHeavy = isHeavyAnimation('css-keyframes', codeSnippet);
      animations.push({
        filePath,
        library: 'css',
        isHeavy,
        recommendation: ANIMATION_RECOMMENDATIONS['css-keyframes'],
        lineNumber,
        codeSnippet,
        animationType: 'css-keyframes',
      });
    }
  }
  
  // Check for animation property
  const animationPropertyRegex = new RegExp(CSS_ANIMATION_PATTERNS.animationProperty.source, 'gi');
  while ((match = animationPropertyRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const codeSnippet = extractCodeSnippet(content, match.index);
      const isHeavy = isHeavyAnimation('css-animation-property', codeSnippet);
      animations.push({
        filePath,
        library: 'css',
        isHeavy,
        recommendation: ANIMATION_RECOMMENDATIONS['css-animation-property'],
        lineNumber,
        codeSnippet,
        animationType: 'css-animation-property',
      });
    }
  }
  
  // Check for complex transitions
  const complexTransitionRegex = new RegExp(CSS_ANIMATION_PATTERNS.complexTransition.source, 'gi');
  while ((match = complexTransitionRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const codeSnippet = extractCodeSnippet(content, match.index);
      const isHeavy = isHeavyAnimation('css-transition-complex', codeSnippet);
      animations.push({
        filePath,
        library: 'css',
        isHeavy,
        recommendation: ANIMATION_RECOMMENDATIONS['css-transition-complex'],
        lineNumber,
        codeSnippet,
        animationType: 'css-transition-complex',
      });
    }
  }
  
  // Check for Tailwind animate-* classes
  const tailwindAnimateRegex = new RegExp(CSS_ANIMATION_PATTERNS.tailwindAnimate.source, 'g');
  while ((match = tailwindAnimateRegex.exec(content)) !== null) {
    const lineNumber = getLineNumber(content, match.index);
    if (!seenLines.has(lineNumber)) {
      seenLines.add(lineNumber);
      const codeSnippet = extractCodeSnippet(content, match.index);
      // Tailwind animate classes are generally lightweight
      animations.push({
        filePath,
        library: 'css',
        isHeavy: false,
        recommendation: 'Tailwind animate classes are lightweight. Ensure they respect prefers-reduced-motion.',
        lineNumber,
        codeSnippet,
        animationType: 'css-animation-property',
      });
    }
  }
  
  return animations;
}

/**
 * Detects other animation library usage in file content.
 */
function detectOtherAnimationLibraries(content: string, filePath: string): ExtendedAnimationUsage[] {
  const animations: ExtendedAnimationUsage[] = [];
  const seenLines = new Set<number>();
  
  const libraryChecks: { pattern: RegExp; type: AnimationDetectionType }[] = [
    { pattern: OTHER_ANIMATION_LIBRARY_PATTERNS.gsap, type: 'gsap-import' },
    { pattern: OTHER_ANIMATION_LIBRARY_PATTERNS.reactSpring, type: 'react-spring-import' },
    { pattern: OTHER_ANIMATION_LIBRARY_PATTERNS.animeJs, type: 'anime-js-import' },
    { pattern: OTHER_ANIMATION_LIBRARY_PATTERNS.lottie, type: 'lottie-import' },
  ];
  
  for (const { pattern, type } of libraryChecks) {
    const regex = new RegExp(pattern.source, 'g');
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index);
      if (!seenLines.has(lineNumber)) {
        seenLines.add(lineNumber);
        const codeSnippet = extractCodeSnippet(content, match.index);
        animations.push({
          filePath,
          library: 'custom',
          isHeavy: true,
          recommendation: ANIMATION_RECOMMENDATIONS[type],
          lineNumber,
          codeSnippet,
          animationType: type,
        });
      }
    }
  }
  
  return animations;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Scans a single file for animation usage.
 * 
 * @param filePath - Path to the file (relative to project root)
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns Array of ExtendedAnimationUsage found in the file
 */
export function scanFileForAnimations(
  filePath: string,
  baseDir: string = process.cwd()
): ExtendedAnimationUsage[] {
  const fullPath = path.join(baseDir, filePath);
  
  try {
    if (!fs.existsSync(fullPath)) {
      return [];
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const animations: ExtendedAnimationUsage[] = [];
    
    // Detect framer-motion
    animations.push(...detectFramerMotion(content, filePath));
    
    // Detect CSS animations
    animations.push(...detectCSSAnimations(content, filePath));
    
    // Detect other animation libraries
    animations.push(...detectOtherAnimationLibraries(content, filePath));
    
    return animations;
  } catch {
    return [];
  }
}

/**
 * Scans the codebase for all animation usage.
 * 
 * @param baseDir - Base directory to scan (defaults to 'src')
 * @returns AnimationScanResult containing all animation findings
 * 
 * **Validates: Requirements 7.2**
 */
export function scanAnimations(baseDir: string = 'src'): AnimationScanResult {
  const projectRoot = process.cwd();
  const scanDir = path.join(projectRoot, baseDir);
  const errors: { filePath: string; error: string }[] = [];
  const animations: ExtendedAnimationUsage[] = [];
  const framerMotionFiles: string[] = [];
  
  const files = findSourceFiles(scanDir, projectRoot);
  
  for (const filePath of files) {
    try {
      const fileAnimations = scanFileForAnimations(filePath, projectRoot);
      animations.push(...fileAnimations);
      
      // Track files with framer-motion
      if (fileAnimations.some(a => a.library === 'framer-motion')) {
        framerMotionFiles.push(filePath);
      }
    } catch (error) {
      errors.push({
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  // Calculate library breakdown
  const libraryBreakdown: Record<AnimationLibrary, number> = {
    'framer-motion': 0,
    'css': 0,
    'custom': 0,
  };
  
  for (const animation of animations) {
    libraryBreakdown[animation.library]++;
  }
  
  // Generate performance issues for heavy animations
  const performanceIssues: PerformanceIssue[] = animations
    .filter(a => a.isHeavy)
    .map(a => ({
      type: 'HEAVY_ANIMATION' as const,
      filePath: a.filePath,
      lineNumber: a.lineNumber,
      evidence: `${a.animationType}: ${a.codeSnippet.substring(0, 100)}...`,
      impact: a.library === 'framer-motion' ? 'high' as const : 'medium' as const,
      recommendation: a.recommendation,
    }));
  
  return {
    animations,
    totalAnimations: animations.length,
    heavyAnimationCount: animations.filter(a => a.isHeavy).length,
    performanceIssues,
    libraryBreakdown,
    framerMotionFiles,
    errors,
  };
}

/**
 * Finds all framer-motion imports in the codebase.
 * 
 * @param baseDir - Base directory to scan (defaults to 'src')
 * @returns Array of AnimationUsage for framer-motion imports
 * 
 * **Validates: Requirements 7.2**
 */
export function findFramerMotionImports(baseDir: string = 'src'): AnimationUsage[] {
  const result = scanAnimations(baseDir);
  return result.animations
    .filter(a => a.library === 'framer-motion')
    .map(a => ({
      filePath: a.filePath,
      library: a.library,
      isHeavy: a.isHeavy,
      recommendation: a.recommendation,
    }));
}

/**
 * Finds all heavy CSS animations in the codebase.
 * 
 * @param baseDir - Base directory to scan (defaults to 'src')
 * @returns Array of AnimationUsage for heavy CSS animations
 * 
 * **Validates: Requirements 7.2**
 */
export function findHeavyCSSAnimations(baseDir: string = 'src'): AnimationUsage[] {
  const result = scanAnimations(baseDir);
  return result.animations
    .filter(a => a.library === 'css' && a.isHeavy)
    .map(a => ({
      filePath: a.filePath,
      library: a.library,
      isHeavy: a.isHeavy,
      recommendation: a.recommendation,
    }));
}

/**
 * Gets a summary of animation usage in the codebase.
 * 
 * @param result - AnimationScanResult to summarize
 * @returns Human-readable summary string
 */
export function getAnimationSummary(result: AnimationScanResult): string {
  const lines: string[] = [];
  
  lines.push('Animation Scanner Summary');
  lines.push('=========================\n');
  
  lines.push(`Total animations found: ${result.totalAnimations}`);
  lines.push(`Heavy animations: ${result.heavyAnimationCount}`);
  lines.push('');
  
  lines.push('Library Breakdown:');
  lines.push(`  - framer-motion: ${result.libraryBreakdown['framer-motion']}`);
  lines.push(`  - CSS animations: ${result.libraryBreakdown['css']}`);
  lines.push(`  - Custom/Other: ${result.libraryBreakdown['custom']}`);
  lines.push('');
  
  if (result.framerMotionFiles.length > 0) {
    lines.push('Files with framer-motion:');
    for (const file of result.framerMotionFiles) {
      lines.push(`  - ${file}`);
    }
    lines.push('');
  }
  
  if (result.performanceIssues.length > 0) {
    lines.push('Performance Issues:');
    for (const issue of result.performanceIssues) {
      lines.push(`  [${issue.impact.toUpperCase()}] ${issue.filePath}:${issue.lineNumber}`);
      lines.push(`    ${issue.recommendation}`);
    }
    lines.push('');
  }
  
  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  - ${error.filePath}: ${error.error}`);
    }
  }
  
  return lines.join('\n');
}

// =============================================================================
// CLI Execution
// =============================================================================

/**
 * Runs the animation scanner and prints results to console.
 * Can be called directly or via CLI.
 */
export function runAnimationScannerCLI(): void {
  console.log('Animation Scanner for MIHAS Frontend-Backend Forensic Audit');
  console.log('============================================================\n');
  
  const result = scanAnimations();
  console.log(getAnimationSummary(result));
  
  // Detailed output for heavy animations
  if (result.heavyAnimationCount > 0) {
    console.log('\nDetailed Heavy Animation Findings:');
    console.log('----------------------------------');
    
    for (const animation of result.animations.filter(a => a.isHeavy)) {
      console.log(`\nFile: ${animation.filePath}:${animation.lineNumber}`);
      console.log(`Type: ${animation.animationType}`);
      console.log(`Library: ${animation.library}`);
      console.log(`Recommendation: ${animation.recommendation}`);
      console.log(`Code snippet:\n  ${animation.codeSnippet.split('\n').join('\n  ')}`);
    }
  }
}

// Check if running as main module
const isMainModule = (): boolean => {
  const scriptPath = process.argv[1];
  if (!scriptPath) return false;
  
  const normalizedScript = scriptPath.replace(/\\/g, '/');
  const normalizedMeta = import.meta.url.replace(/\\/g, '/').replace('file:///', '').replace('file://', '');
  
  return normalizedScript.includes('animationScanner') || normalizedMeta.includes(normalizedScript);
};

if (isMainModule()) {
  runAnimationScannerCLI();
}
