// @vitest-environment node
// Feature: ui-ux-quality-audit, Property 11: Skeleton type mapping returns correct component
/**
 * Property 11: Skeleton type mapping returns correct component
 *
 * For each SkeletonType value from the set {'dashboard', 'auth', 'wizard',
 * 'admin-table', 'detail', 'none'}, the skeleton system SHALL map to the
 * correct skeleton component.
 *
 * We verify this by:
 * 1. Checking the exported skeletonRegistry maps each type to the correct component
 * 2. Checking the getSkeletonFallback switch statement in App.tsx covers all types
 *
 * **Validates: Requirements 13.4, 13.5, 13.6**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All valid SkeletonType values from routes/config.tsx */
const SKELETON_TYPES = ['dashboard', 'auth', 'wizard', 'admin-table', 'detail', 'none'] as const
type SkeletonType = (typeof SKELETON_TYPES)[number]

/**
 * Expected mapping from SkeletonType to the component name used in the
 * getSkeletonFallback switch and skeletonRegistry.
 *
 * Based on the actual implementation in App.tsx and skeletons/index.tsx:
 * - 'dashboard'    → DashboardSkeleton
 * - 'auth'         → AuthSkeleton
 * - 'wizard'       → WizardSkeleton
 * - 'admin-table'  → AdminTableSkeleton
 * - 'detail'       → DetailSkeleton
 * - 'none'         → DelayedPageLoader (fallback, not in registry)
 */
const EXPECTED_MAPPING: Record<string, string> = {
  dashboard: 'DashboardSkeleton',
  auth: 'AuthSkeleton',
  wizard: 'WizardSkeleton',
  'admin-table': 'AdminTableSkeleton',
  detail: 'DetailSkeleton',
}

// ---------------------------------------------------------------------------
// Source file reading
// ---------------------------------------------------------------------------

const APP_TSX_PATH = join(process.cwd(), 'src', 'components', 'AuthenticatedRouteShell.tsx')
const SKELETONS_INDEX_PATH = join(process.cwd(), 'src', 'components', 'ui', 'skeletons', 'index.tsx')
const ROUTES_CONFIG_PATH = join(process.cwd(), 'src', 'routes', 'config.tsx')

const appTsxContent = readFileSync(APP_TSX_PATH, 'utf-8')
const skeletonsIndexContent = readFileSync(SKELETONS_INDEX_PATH, 'utf-8')
const routesConfigContent = readFileSync(ROUTES_CONFIG_PATH, 'utf-8')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the getSkeletonFallback function body from App.tsx,
 * then parse its switch cases.
 * Returns a map of skeleton type → component name from the switch statement.
 */
function extractSwitchCases(source: string): Map<string, string> {
  const cases = new Map<string, string>()

  // First, isolate the getSkeletonFallback function body.
  // Find the function start and extract until its closing brace.
  const fnStart = source.indexOf('function getSkeletonFallback')
  if (fnStart === -1) return cases

  // Find the function's opening brace
  const bodyStart = source.indexOf('{', fnStart)
  if (bodyStart === -1) return cases

  // Track brace depth to find the matching closing brace
  let depth = 0
  let bodyEnd = bodyStart
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') depth--
    if (depth === 0) {
      bodyEnd = i
      break
    }
  }

  const fnBody = source.slice(bodyStart, bodyEnd + 1)

  // Now parse switch cases only within the function body
  const casePattern = /case\s+'([^']+)':\s*\n?\s*return\s+<(\w+)/g
  let match: RegExpExecArray | null
  while ((match = casePattern.exec(fnBody)) !== null) {
    cases.set(match[1], match[2])
  }

  return cases
}

/**
 * Extract the skeletonRegistry entries from skeletons/index.tsx.
 * Returns a map of skeleton type → component name.
 */
function extractRegistryEntries(source: string): Map<string, string> {
  const entries = new Map<string, string>()

  // Match patterns like: dashboard: DashboardSkeleton,
  // or: 'admin-table': AdminTableSkeleton,
  const entryPattern = /['"]?([a-z-]+)['"]?\s*:\s*(\w+Skeleton)/g
  let match: RegExpExecArray | null
  while ((match = entryPattern.exec(source)) !== null) {
    entries.set(match[1], match[2])
  }

  return entries
}

const switchCases = extractSwitchCases(appTsxContent)
const registryEntries = extractRegistryEntries(skeletonsIndexContent)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 11: Skeleton type mapping returns correct component', () => {
  // Verify the SkeletonType definition includes all expected types
  it('SkeletonType definition includes all expected skeleton types', () => {
    for (const type of SKELETON_TYPES) {
      expect(
        routesConfigContent,
        `SkeletonType should include '${type}'`
      ).toContain(type)
    }
  })

  // Property test: for any skeleton type, the switch in getSkeletonFallback handles it
  it('Property 11: getSkeletonFallback switch covers every SkeletonType', () => {
    const skeletonTypeArb = fc.constantFrom(...SKELETON_TYPES)

    fc.assert(
      fc.property(skeletonTypeArb, (skeletonType: SkeletonType) => {
        if (skeletonType === 'none') {
          // 'none' is handled by the default case in the switch, which returns
          // DelayedPageLoader — not a skeleton component. Verify it's in the
          // switch as either an explicit case or covered by default.
          const hasNoneCase = /case\s+'none'/.test(appTsxContent)
          const hasDefault = /default:/.test(appTsxContent)
          expect(
            hasNoneCase || hasDefault,
            `getSkeletonFallback must handle 'none' via explicit case or default`
          ).toBe(true)
          return
        }

        // For all other types, verify the switch has an explicit case
        // that returns the expected component
        const expectedComponent = EXPECTED_MAPPING[skeletonType]
        const caseComponent = switchCases.get(skeletonType)

        expect(
          caseComponent,
          `getSkeletonFallback switch should have case '${skeletonType}' ` +
          `returning <${expectedComponent} />, but found: ${caseComponent ?? 'no case'}`
        ).toBe(expectedComponent)
      }),
      { numRuns: 100 }
    )
  })

  // Property test: for any skeleton type in the registry, it maps to the correct component
  it('Property 11: skeletonRegistry maps each type to the correct component', () => {
    // Registry covers all types except 'none' (which has no skeleton)
    const registeredTypes = SKELETON_TYPES.filter((t) => t !== 'none')
    const registeredTypeArb = fc.constantFrom(...registeredTypes)

    fc.assert(
      fc.property(registeredTypeArb, (skeletonType) => {
        const expectedComponent = EXPECTED_MAPPING[skeletonType]
        const registryComponent = registryEntries.get(skeletonType)

        expect(
          registryComponent,
          `skeletonRegistry['${skeletonType}'] should be ${expectedComponent}, ` +
          `but found: ${registryComponent ?? 'missing'}`
        ).toBe(expectedComponent)
      }),
      { numRuns: 100 }
    )
  })

  // Verify the switch and registry are consistent with each other
  it('Property 11: getSkeletonFallback switch and skeletonRegistry are consistent', () => {
    const registeredTypes = SKELETON_TYPES.filter((t) => t !== 'none')
    const registeredTypeArb = fc.constantFrom(...registeredTypes)

    fc.assert(
      fc.property(registeredTypeArb, (skeletonType) => {
        const switchComponent = switchCases.get(skeletonType)
        const registryComponent = registryEntries.get(skeletonType)

        expect(
          switchComponent,
          `Switch case for '${skeletonType}' should exist`
        ).toBeDefined()

        expect(
          registryComponent,
          `Registry entry for '${skeletonType}' should exist`
        ).toBeDefined()

        expect(
          switchComponent,
          `Switch and registry should agree on component for '${skeletonType}': ` +
          `switch=${switchComponent}, registry=${registryComponent}`
        ).toBe(registryComponent)
      }),
      { numRuns: 100 }
    )
  })

  // Verify each skeleton component file actually exists
  it('Property 11: each mapped skeleton component file exists', () => {
    const registeredTypes = SKELETON_TYPES.filter((t) => t !== 'none')
    const registeredTypeArb = fc.constantFrom(...registeredTypes)

    fc.assert(
      fc.property(registeredTypeArb, (skeletonType) => {
        const componentName = EXPECTED_MAPPING[skeletonType]
        const componentPath = join(
          process.cwd(),
          'src',
          'components',
          'ui',
          'skeletons',
          `${componentName}.tsx`
        )

        let fileExists = false
        try {
          readFileSync(componentPath, 'utf-8')
          fileExists = true
        } catch {
          fileExists = false
        }

        expect(
          fileExists,
          `Skeleton component file ${componentName}.tsx should exist at ` +
          `src/components/ui/skeletons/${componentName}.tsx`
        ).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  // Verify each skeleton component exports the expected function
  it('Property 11: each skeleton component exports the named function', () => {
    const registeredTypes = SKELETON_TYPES.filter((t) => t !== 'none')
    const registeredTypeArb = fc.constantFrom(...registeredTypes)

    fc.assert(
      fc.property(registeredTypeArb, (skeletonType) => {
        const componentName = EXPECTED_MAPPING[skeletonType]
        const componentPath = join(
          process.cwd(),
          'src',
          'components',
          'ui',
          'skeletons',
          `${componentName}.tsx`
        )

        const content = readFileSync(componentPath, 'utf-8')
        const exportPattern = new RegExp(
          `export\\s+function\\s+${componentName}\\b`
        )

        expect(
          exportPattern.test(content),
          `${componentName}.tsx should export function ${componentName}`
        ).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
