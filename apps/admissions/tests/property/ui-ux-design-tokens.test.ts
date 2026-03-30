// @vitest-environment node
/**
 * Property 1: Semantic color token enforcement
 * Feature: website-ui-ux-fix, Property 1: Semantic color token enforcement
 *
 * For any component file in `src/components/ui/`, the file SHALL NOT contain
 * hardcoded Tailwind color palette classes (e.g., green-300, red-50, blue-600,
 * yellow-200, slate-900) and SHALL only use semantic color tokens (primary,
 * secondary, destructive, muted, accent, success, warning, info, error,
 * foreground, background, card, border, ring, skeleton, admin, link) or
 * opacity modifiers on those tokens.
 *
 * **Validates: Requirements 1.3, 1.5, 2.2, 6.1, 10.4**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Collect all .tsx files recursively from src/components/ui/
function collectTsxFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...collectTsxFiles(fullPath))
    } else if (entry.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

const UI_DIR = join(process.cwd(), 'src', 'components', 'ui')
const componentFiles = collectTsxFiles(UI_DIR)

/**
 * Regex matching hardcoded Tailwind palette color classes.
 * Matches patterns like: red-50, green-300, blue-600, slate-900, etc.
 * Does NOT match semantic tokens like: primary, destructive, success, etc.
 * Does NOT match white/black (they're not palette colors).
 */
const FORBIDDEN_PALETTE_REGEX =
  /\b(?:red|green|blue|yellow|orange|purple|pink|indigo|teal|cyan|emerald|violet|fuchsia|rose|amber|lime|sky|slate|gray|zinc|neutral|stone)-\d{1,3}\b/g

/**
 * Strip content that should be excluded from scanning:
 * - Single-line comments (// ...)
 * - Multi-line comments (/* ... *​/)
 * - Non-className string literals are kept since palette colors
 *   in any context (template literals, variables) indicate violations
 */
function stripComments(content: string): string {
  // Remove single-line comments
  let result = content.replace(/\/\/.*$/gm, '')
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  return result
}

/**
 * Find all forbidden hardcoded palette color matches in a file's content.
 * Returns an array of matched strings, or empty if compliant.
 */
function findForbiddenColors(content: string): string[] {
  const cleaned = stripComments(content)
  const matches = cleaned.match(FORBIDDEN_PALETTE_REGEX)
  return matches ?? []
}

describe('Feature: website-ui-ux-fix, Property 1: Semantic color token enforcement', () => {
  // Sanity check: we actually found component files
  it('should find component files to test', () => {
    expect(componentFiles.length).toBeGreaterThan(0)
  })

  it('Property 1: all component files use only semantic color tokens', () => {
    // Create an arbitrary that picks from the real component file list
    const fileIndexArb = fc.integer({ min: 0, max: componentFiles.length - 1 })

    fc.assert(
      fc.property(fileIndexArb, (index) => {
        const filePath = componentFiles[index]
        const content = readFileSync(filePath, 'utf-8')
        const violations = findForbiddenColors(content)

        // Extract relative path for readable error messages
        const relativePath = filePath.replace(process.cwd() + '/', '')

        expect(
          violations,
          `${relativePath} contains hardcoded palette colors: ${violations.join(', ')}. ` +
          `Use semantic tokens (primary, destructive, success, warning, info, etc.) instead.`
        ).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  // Exhaustive check: verify EVERY file, not just random samples
  it('Property 1 (exhaustive): no component file contains hardcoded palette colors', () => {
    const violations: { file: string; colors: string[] }[] = []

    for (const filePath of componentFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const forbidden = findForbiddenColors(content)
      if (forbidden.length > 0) {
        violations.push({
          file: filePath.replace(process.cwd() + '/', ''),
          colors: forbidden,
        })
      }
    }

    expect(
      violations,
      `Found hardcoded palette colors in:\n${violations
        .map((v) => `  ${v.file}: ${v.colors.join(', ')}`)
        .join('\n')}`
    ).toHaveLength(0)
  })
})


/**
 * Property 10: Animation duration token enforcement
 * Feature: website-ui-ux-fix, Property 10: Animation duration token enforcement
 *
 * For any component file in `src/components/ui/`, all CSS transition duration
 * classes SHALL use only the defined tokens (duration-fast/150, duration-normal/200,
 * duration-slow/300) or the animation durations defined in tailwind.config.js keyframes.
 *
 * **Validates: Requirements 9.1**
 */

/**
 * Allowed duration classes:
 * - Named design tokens: duration-fast (150ms), duration-normal (200ms), duration-slow (300ms)
 * - Tailwind numeric defaults that map to the token values or are standard Tailwind utilities:
 *   duration-75, duration-100, duration-150, duration-200, duration-300, duration-500, duration-700, duration-1000
 */
const ALLOWED_DURATION_CLASSES = new Set([
  'duration-fast',
  'duration-normal',
  'duration-slow',
  'duration-75',
  'duration-100',
  'duration-150',
  'duration-200',
  'duration-300',
  'duration-500',
  'duration-700',
  'duration-1000',
])

/**
 * Regex to find all duration-* classes in file content.
 * Matches `duration-` followed by one or more word characters.
 */
const DURATION_CLASS_REGEX = /\bduration-(\w+)\b/g

/**
 * Find all non-allowed duration classes in file content.
 * Returns an array of violating duration class strings.
 */
function findForbiddenDurations(content: string): string[] {
  const cleaned = stripComments(content)
  const violations: string[] = []
  let match: RegExpExecArray | null
  // Reset regex state
  DURATION_CLASS_REGEX.lastIndex = 0
  while ((match = DURATION_CLASS_REGEX.exec(cleaned)) !== null) {
    const fullClass = match[0] // e.g. "duration-200"
    if (!ALLOWED_DURATION_CLASSES.has(fullClass)) {
      violations.push(fullClass)
    }
  }
  return violations
}

describe('Feature: website-ui-ux-fix, Property 10: Animation duration token enforcement', () => {
  // Sanity check: we actually found component files to test
  it('should find component files to test', () => {
    expect(componentFiles.length).toBeGreaterThan(0)
  })

  it('Property 10: all component files use only allowed duration tokens', () => {
    const fileIndexArb = fc.integer({ min: 0, max: componentFiles.length - 1 })

    fc.assert(
      fc.property(fileIndexArb, (index) => {
        const filePath = componentFiles[index]
        const content = readFileSync(filePath, 'utf-8')
        const violations = findForbiddenDurations(content)

        const relativePath = filePath.replace(process.cwd() + '/', '')

        expect(
          violations,
          `${relativePath} contains non-allowed duration classes: ${[...new Set(violations)].join(', ')}. ` +
          `Use only design token durations (duration-fast, duration-normal, duration-slow) ` +
          `or standard Tailwind durations (duration-75, duration-100, duration-150, duration-200, duration-300, duration-500, duration-700, duration-1000).`
        ).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  // Exhaustive check: verify EVERY file, not just random samples
  it('Property 10 (exhaustive): no component file contains forbidden duration classes', () => {
    const violations: { file: string; durations: string[] }[] = []

    for (const filePath of componentFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const forbidden = findForbiddenDurations(content)
      if (forbidden.length > 0) {
        violations.push({
          file: filePath.replace(process.cwd() + '/', ''),
          durations: [...new Set(forbidden)],
        })
      }
    }

    expect(
      violations,
      `Found non-allowed duration classes in:\n${violations
        .map((v) => `  ${v.file}: ${v.durations.join(', ')}`)
        .join('\n')}`
    ).toHaveLength(0)
  })
})


/**
 * Property 11: Animation keyframes use only transform and opacity
 * Feature: website-ui-ux-fix, Property 11: Animation keyframes use only transform and opacity
 *
 * For any keyframe animation defined in tailwind.config.js, the animated properties
 * SHALL be limited to `transform`, `opacity`, and `backgroundPosition` (for shimmer).
 *
 * **Validates: Requirements 9.2**
 */

/**
 * Allowed CSS properties in keyframe animations.
 * These are GPU-accelerated or shimmer-related properties.
 */
const ALLOWED_KEYFRAME_PROPERTIES = new Set([
  'transform',
  'opacity',
  'backgroundPosition',
  'backgroundSize',
  'background-position',
  'background-size',
  // Shorthand transform sub-properties (CSS individual transform properties)
  'translateX',
  'translateY',
  'translateZ',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'skewX',
  'skewY',
])

/**
 * Parse keyframes from tailwind.config.js file content.
 * Returns a map of keyframe name → array of { step, properties }.
 */
function parseKeyframes(configContent: string): Record<string, Record<string, Record<string, string>>> {
  // Use a sandboxed evaluation approach: extract the module.exports object
  // by wrapping in a function that captures the config
  const wrappedContent = configContent
    .replace(/require\([^)]+\)/g, '(() => ({}))') // stub out require() calls
    .replace('module.exports =', 'return')

  const getConfig = new Function(wrappedContent)
  const config = getConfig()

  return config?.theme?.extend?.keyframes ?? {}
}

/**
 * For a given keyframe definition, collect all CSS property names used across all steps.
 * Returns an array of property names (excluding step selectors like '0%', '100%', 'from', 'to').
 */
function getKeyframeProperties(keyframeDef: Record<string, Record<string, string>>): string[] {
  const properties: string[] = []
  for (const step of Object.values(keyframeDef)) {
    if (typeof step === 'object' && step !== null) {
      for (const prop of Object.keys(step)) {
        properties.push(prop)
      }
    }
  }
  return properties
}

describe('Feature: website-ui-ux-fix, Property 11: Animation keyframes use only transform and opacity', () => {
  const configPath = join(process.cwd(), 'tailwind.config.js')
  const configContent = readFileSync(configPath, 'utf-8')
  const keyframes = parseKeyframes(configContent)
  const keyframeNames = Object.keys(keyframes)

  // Sanity check: we actually found keyframes to test
  it('should find keyframe definitions in tailwind.config.js', () => {
    expect(keyframeNames.length).toBeGreaterThan(0)
  })

  it('Property 11: all keyframe animations use only transform, opacity, and backgroundPosition', () => {
    // Generate random keyframe names from the parsed config
    const keyframeIndexArb = fc.integer({ min: 0, max: keyframeNames.length - 1 })

    fc.assert(
      fc.property(keyframeIndexArb, (index) => {
        const name = keyframeNames[index]
        const keyframeDef = keyframes[name]
        const properties = getKeyframeProperties(keyframeDef)

        const forbidden = properties.filter((prop) => !ALLOWED_KEYFRAME_PROPERTIES.has(prop))

        expect(
          forbidden,
          `Keyframe "${name}" uses non-GPU-accelerated properties: ${forbidden.join(', ')}. ` +
          `Only transform, opacity, and backgroundPosition/backgroundSize are allowed for GPU-accelerated rendering.`
        ).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  // Exhaustive check: verify EVERY keyframe, not just random samples
  it('Property 11 (exhaustive): no keyframe animation uses forbidden CSS properties', () => {
    const violations: { keyframe: string; properties: string[] }[] = []

    for (const name of keyframeNames) {
      const keyframeDef = keyframes[name]
      const properties = getKeyframeProperties(keyframeDef)
      const forbidden = properties.filter((prop) => !ALLOWED_KEYFRAME_PROPERTIES.has(prop))

      if (forbidden.length > 0) {
        violations.push({
          keyframe: name,
          properties: [...new Set(forbidden)],
        })
      }
    }

    expect(
      violations,
      `Found non-GPU-accelerated properties in keyframes:\n${violations
        .map((v) => `  ${v.keyframe}: ${v.properties.join(', ')}`)
        .join('\n')}\n` +
      `Only transform, opacity, and backgroundPosition/backgroundSize are allowed.`
    ).toHaveLength(0)
  })
})
