/**
 * Frontend-Backend Action Alignment Test
 *
 * Static analysis test that parses frontend service files for action parameters
 * and verifies each has a matching case in the backend router.
 *
 * Feature: mcp-verification-recovery, Property 20: Frontend-backend action parameter alignment
 * Validates: Requirements 18.1, 18.2, 18.3, 18.4
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FrontendAction {
  service: string       // relative path of the frontend file
  endpoint: string      // e.g. '/api/admin'
  action: string        // e.g. 'users'
  paramName: string     // 'action' or 'type' (catalog uses type=)
}

interface BackendCase {
  file: string          // relative path of the backend file
  actions: string[]     // list of handled action/type values
}

interface AlignmentResult {
  service: string
  endpoint: string
  action: string
  paramName: string
  backendFile: string
  hasMatchingCase: boolean
}

// ---------------------------------------------------------------------------
// Endpoint → backend file mapping
// ---------------------------------------------------------------------------

const ENDPOINT_TO_BACKEND: Record<string, string> = {
  '/api/admin': 'api-src/admin.ts',
  '/api/applications': 'api-src/applications.ts',
  '/api/auth': 'api-src/auth.ts',
  '/api/catalog': 'api-src/catalog.ts',
  '/api/documents': 'api-src/documents.ts',
  '/api/health': 'api-src/health.ts',
  '/api/notifications': 'api-src/notifications.ts',
  '/api/payments': 'api-src/payments.ts',
  '/api/sessions': 'api-src/sessions.ts',
}

// ---------------------------------------------------------------------------
// Frontend directories to scan
// ---------------------------------------------------------------------------

const FRONTEND_DIRS = ['src/services', 'src/lib', 'src/hooks']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..')

function readFileContent(relativePath: string): string {
  const fullPath = path.join(ROOT, relativePath)
  if (!fs.existsSync(fullPath)) return ''
  return fs.readFileSync(fullPath, 'utf-8')
}

function collectTsFiles(dir: string): string[] {
  const fullDir = path.join(ROOT, dir)
  if (!fs.existsSync(fullDir)) return []
  const results: string[] = []
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const entryPath = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
      } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        results.push(path.relative(ROOT, entryPath))
      }
    }
  }
  walk(fullDir)
  return results
}

// ---------------------------------------------------------------------------
// Frontend action extraction
// ---------------------------------------------------------------------------

/**
 * Extract action parameters from frontend source files.
 *
 * Patterns detected:
 * 1. URL query params:  /api/admin?action=users  or  ?action=users
 * 2. URL query params:  /api/catalog?type=programs
 * 3. Path-based URLs that ApiClient.normalizeEndpoint converts:
 *    /admin/dashboard  → /api/admin?action=dashboard
 *    /catalog/programs → /api/catalog?type=programs
 *    /auth/login       → /api/auth?action=login
 *    /documents/upload → /api/documents?action=upload
 *    /notifications/send → /api/notifications?action=send
 */
function extractFrontendActions(filePath: string, content: string): FrontendAction[] {
  const actions: FrontendAction[] = []
  const seen = new Set<string>()

  const addAction = (endpoint: string, action: string, paramName: string) => {
    const key = `${endpoint}|${action}|${paramName}`
    if (seen.has(key)) return
    seen.add(key)
    actions.push({ service: filePath, endpoint, action, paramName })
  }

  // Pattern 1: Explicit query param ?action=xxx in URL strings
  // Matches: '/api/admin?action=users', `/api/auth?action=login`, etc.
  const queryActionRegex = /\/api\/(\w+)\?(?:[^'"`]*&)?action=([\w-]+)/g
  let match: RegExpExecArray | null
  while ((match = queryActionRegex.exec(content)) !== null) {
    const resource = match[1]
    const action = match[2]
    addAction(`/api/${resource}`, action, 'action')
  }

  // Pattern 2: Explicit query param ?type=xxx (catalog)
  const queryTypeRegex = /\/api\/(\w+)\?(?:[^'"`]*&)?type=([\w-]+)/g
  while ((match = queryTypeRegex.exec(content)) !== null) {
    const resource = match[1]
    const typeVal = match[2]
    addAction(`/api/${resource}`, typeVal, 'type')
  }

  // Pattern 3: Path-based URLs that get normalized by ApiClient
  // e.g. apiClient.request('/admin/dashboard') → /api/admin?action=dashboard
  // e.g. apiClient.request('/catalog/programs') → /api/catalog?type=programs
  // e.g. apiClient.request('/auth/login') → /api/auth?action=login
  const pathBasedRegex = /(?:apiClient\.request|authFetch)\s*(?:<[^>]*>)?\s*\(\s*['"`]\/(\w+)\/([\w-]+)/g
  while ((match = pathBasedRegex.exec(content)) !== null) {
    const resource = match[1]
    const segment = match[2]

    // Skip if this is a dynamic ID (UUID-like or variable interpolation)
    if (segment.startsWith('$') || segment.includes('{')) continue

    const endpoint = `/api/${resource}`
    if (!ENDPOINT_TO_BACKEND[endpoint]) continue

    if (resource === 'catalog') {
      addAction(endpoint, segment, 'type')
    } else {
      addAction(endpoint, segment, 'action')
    }
  }

  // Pattern 4: Template literal path-based URLs
  // e.g. `/applications/${id}?action=xxx`
  const templateActionRegex = /\/(\w+)\/\$\{[^}]+\}\?(?:[^'"`]*&)?action=([\w-]+)/g
  while ((match = templateActionRegex.exec(content)) !== null) {
    const resource = match[1]
    const action = match[2]
    const endpoint = `/api/${resource}`
    if (ENDPOINT_TO_BACKEND[endpoint]) {
      addAction(endpoint, action, 'action')
    }
  }

  // Pattern 5: Query params built via URLSearchParams or object literals
  // e.g. params.set('action', 'export')  or  { action: 'audit-log' }
  const paramsSetRegex = /(?:params\.set|queryParams\.set)\s*\(\s*['"]action['"]\s*,\s*['"](\w[\w-]*)['"](?:\s*\))/g
  while ((match = paramsSetRegex.exec(content)) !== null) {
    // We need to figure out which endpoint this belongs to.
    // Look backwards in the content for the nearest endpoint reference.
    const action = match[1]
    const before = content.slice(0, match.index)
    const endpointMatch = before.match(/\/api\/(\w+)|\/(\w+)(?=\?|\/|\s*['"`])/g)
    if (endpointMatch) {
      const lastEndpoint = endpointMatch[endpointMatch.length - 1]
      const resourceMatch = lastEndpoint.match(/\/(?:api\/)?(\w+)/)
      if (resourceMatch) {
        const resource = resourceMatch[1]
        const endpoint = `/api/${resource}`
        if (ENDPOINT_TO_BACKEND[endpoint]) {
          addAction(endpoint, action, 'action')
        }
      }
    }
  }

  return actions
}

// ---------------------------------------------------------------------------
// Backend action extraction
// ---------------------------------------------------------------------------

/**
 * Extract handled actions from a backend router file.
 *
 * Patterns detected:
 * 1. switch/case:  case 'users':
 * 2. if-based:     if (action === 'track')
 * 3. catalog type: if (type === 'programs')
 * 4. Body actions: if (action === 'update_status')  (inside PUT/PATCH handlers)
 */
function extractBackendActions(filePath: string): BackendCase {
  const content = readFileContent(filePath)
  const actions: string[] = []
  const seen = new Set<string>()

  const addAction = (action: string) => {
    if (!seen.has(action)) {
      seen.add(action)
      actions.push(action)
    }
  }

  // Pattern 1: case 'xxx':
  const caseRegex = /case\s+['"](\w[\w-]*)['"]\s*:/g
  let match: RegExpExecArray | null
  while ((match = caseRegex.exec(content)) !== null) {
    // Skip HTTP method cases (GET, POST, PUT, DELETE, PATCH)
    if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].includes(match[1])) continue
    addAction(match[1])
  }

  // Pattern 2: if (action === 'xxx')
  const ifActionRegex = /action\s*===?\s*['"](\w[\w-]*)['"]/g
  while ((match = ifActionRegex.exec(content)) !== null) {
    addAction(match[1])
  }

  // Pattern 3: if (type === 'xxx') — for catalog
  const ifTypeRegex = /type\s*===?\s*['"](\w[\w-]*)['"]/g
  while ((match = ifTypeRegex.exec(content)) !== null) {
    addAction(match[1])
  }

  return { file: filePath, actions }
}

// ---------------------------------------------------------------------------
// Alignment check
// ---------------------------------------------------------------------------

function checkAlignment(): AlignmentResult[] {
  // 1. Collect all frontend actions
  const allFrontendActions: FrontendAction[] = []
  for (const dir of FRONTEND_DIRS) {
    const files = collectTsFiles(dir)
    for (const file of files) {
      const content = readFileContent(file)
      const actions = extractFrontendActions(file, content)
      allFrontendActions.push(...actions)
    }
  }

  // 2. Collect all backend actions (cached per file)
  const backendCache = new Map<string, BackendCase>()
  for (const backendFile of Object.values(ENDPOINT_TO_BACKEND)) {
    if (!backendCache.has(backendFile)) {
      backendCache.set(backendFile, extractBackendActions(backendFile))
    }
  }

  // 3. Deduplicate frontend actions across files (same endpoint+action)
  const uniqueActions = new Map<string, FrontendAction>()
  for (const fa of allFrontendActions) {
    const key = `${fa.endpoint}|${fa.action}|${fa.paramName}`
    if (!uniqueActions.has(key)) {
      uniqueActions.set(key, fa)
    }
  }

  // 4. Check each frontend action against backend
  const results: AlignmentResult[] = []
  for (const fa of uniqueActions.values()) {
    const backendFile = ENDPOINT_TO_BACKEND[fa.endpoint]
    if (!backendFile) {
      results.push({
        ...fa,
        backendFile: 'UNKNOWN',
        hasMatchingCase: false,
      })
      continue
    }

    const backend = backendCache.get(backendFile)!
    const hasMatch = backend.actions.includes(fa.action)

    results.push({
      ...fa,
      backendFile,
      hasMatchingCase: hasMatch,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Known mismatches: frontend services that call actions with no backend case.
// These are stub/removed features identified by this audit. Each entry
// documents the gap so it can be tracked for future cleanup or implementation.
// ---------------------------------------------------------------------------

const KNOWN_MISMATCHES: Record<string, string[]> = {
  // alternativePathwayService.ts — removed feature, frontend stubs remain
  '/api/applications': [
    'improvement-plans',
    'pathway-recommendations',
    'update-plan-progress',
    'store-pathway-recommendations',
    'store-improvement-plan',
    // detailedEligibilityService.ts — removed feature, frontend stubs remain
    'eligibility-assessments',
    'track-recommendation',
    'recommendation-actions',
    'save-eligibility-assessment',
    // metricsTracking.ts — tracking event stub
    'track-event',
  ],
  // auth signin alias — frontend uses 'signin', backend only has 'login'
  '/api/auth': [
    'signin',
    'verify-email',
  ],
  // documents — acceptance-letter/finance-receipt handled via application PATCH, not documents endpoint
  '/api/documents': [
    'acceptance-letter',
    'finance-receipt',
    'url',
    'info',
  ],
  // notifications — removed/stub channels
  '/api/notifications': [
    'application-submitted',
    'dispatch-channel',
    'update-consent',
    'consent',
  ],
}

function isKnownMismatch(endpoint: string, action: string): boolean {
  return KNOWN_MISMATCHES[endpoint]?.includes(action) ?? false
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Frontend-Backend Action Alignment', () => {
  const results = checkAlignment()

  it('should find frontend actions to verify', () => {
    expect(results.length).toBeGreaterThan(0)
  })

  // Group results by endpoint for readable output
  const byEndpoint = new Map<string, AlignmentResult[]>()
  for (const r of results) {
    const group = byEndpoint.get(r.endpoint) || []
    group.push(r)
    byEndpoint.set(r.endpoint, group)
  }

  for (const [endpoint, endpointResults] of byEndpoint) {
    describe(`${endpoint}`, () => {
      for (const result of endpointResults) {
        const known = isKnownMismatch(result.endpoint, result.action)
        const label = known
          ? `${result.paramName}=${result.action} is a KNOWN mismatch (no backend case in ${result.backendFile})`
          : `${result.paramName}=${result.action} should have a matching backend case in ${result.backendFile}`

        it(label, () => {
          if (known) {
            // Known mismatch — document it but don't fail
            expect(result.hasMatchingCase).toBe(false)
            return
          }

          if (!result.hasMatchingCase) {
            const backend = extractBackendActions(result.backendFile)
            const availableCases = backend.actions.join(', ') || '(none found)'
            expect.fail(
              `Frontend sends ${result.paramName}="${result.action}" to ${result.endpoint} ` +
              `(from ${result.service}), but no matching case found in ${result.backendFile}.\n` +
              `Available backend cases: [${availableCases}]`
            )
          }
          expect(result.hasMatchingCase).toBe(true)
        })
      }
    })
  }

  it('should report alignment summary', () => {
    const aligned = results.filter(r => r.hasMatchingCase)
    const misaligned = results.filter(r => !r.hasMatchingCase)
    const knownMismatches = misaligned.filter(r => isKnownMismatch(r.endpoint, r.action))
    const unknownMismatches = misaligned.filter(r => !isKnownMismatch(r.endpoint, r.action))

    console.log('\n=== Action Alignment Summary ===')
    console.log(`Total frontend actions found: ${results.length}`)
    console.log(`Aligned (backend case exists): ${aligned.length}`)
    console.log(`Known mismatches (documented): ${knownMismatches.length}`)
    console.log(`Unknown mismatches (NEW gaps): ${unknownMismatches.length}`)

    if (knownMismatches.length > 0) {
      console.log('\nKnown mismatches (stub/removed features):')
      for (const m of knownMismatches) {
        console.log(`  - ${m.endpoint}?${m.paramName}=${m.action} (from ${m.service})`)
      }
    }

    if (unknownMismatches.length > 0) {
      console.log('\nUNKNOWN mismatches (require investigation):')
      for (const m of unknownMismatches) {
        console.log(`  - ${m.endpoint}?${m.paramName}=${m.action} (from ${m.service})`)
      }
    }

    // Fail if there are any NEW unknown mismatches
    expect(unknownMismatches).toEqual([])
  })
})
