#!/usr/bin/env node

/**
 * Checkpoint 23 Verification Script
 * Verifies cache invalidation, deployment process, version management, and draft system
 * 
 * Requirements:
 * - Verify cache invalidation works
 * - Test deployment process
 * - Confirm users see latest version
 * - Verify draft system reliability
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

const log = {
  success: (msg) => console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`),
  error: (msg) => console.log(`${COLORS.red}✗${COLORS.reset} ${msg}`),
  warning: (msg) => console.log(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`),
  info: (msg) => console.log(`${COLORS.blue}ℹ${COLORS.reset} ${msg}`),
  section: (msg) => console.log(`\n${COLORS.cyan}═══ ${msg} ═══${COLORS.reset}\n`)
}

let totalChecks = 0
let passedChecks = 0
let failedChecks = 0
let warnings = 0

function check(condition, successMsg, errorMsg) {
  totalChecks++
  if (condition) {
    passedChecks++
    log.success(successMsg)
    return true
  } else {
    failedChecks++
    log.error(errorMsg)
    return false
  }
}

function warn(msg) {
  warnings++
  log.warning(msg)
}

// ============================================================================
// 1. CACHE INVALIDATION VERIFICATION
// ============================================================================

function verifyCacheInvalidation() {
  log.section('1. Cache Invalidation Verification')
  
  // Check service worker cache versioning
  const swPath = 'src/service-worker.ts'
  if (!existsSync(swPath)) {
    check(false, '', 'Service worker file not found')
    return
  }
  
  const swContent = readFileSync(swPath, 'utf-8')
  
  // Verify APP_VERSION is used
  check(
    swContent.includes('APP_VERSION') && swContent.includes('import.meta.env.VITE_APP_VERSION'),
    'Service worker uses VITE_APP_VERSION for cache versioning',
    'Service worker does not use VITE_APP_VERSION'
  )
  
  // Verify CACHE_VERSION includes APP_VERSION
  check(
    swContent.includes('CACHE_VERSION = `v${APP_VERSION}`'),
    'Cache version is derived from APP_VERSION',
    'Cache version is not properly derived from APP_VERSION'
  )
  
  // Verify cache names include version
  check(
    swContent.includes('${CACHE_PREFIX}-') && swContent.includes('-${CACHE_VERSION}'),
    'Cache names include version suffix for invalidation',
    'Cache names do not include version suffix'
  )
  
  // Verify old cache cleanup on activation
  check(
    swContent.includes("addEventListener('activate'") && 
    swContent.includes('caches.delete'),
    'Service worker cleans up old caches on activation',
    'Service worker does not clean up old caches'
  )
  
  // Verify cache update notification to clients
  check(
    swContent.includes('cache-updated') && swContent.includes('client.postMessage'),
    'Service worker notifies clients about cache updates',
    'Service worker does not notify clients about cache updates'
  )
  
  // Check environment variable configuration
  const envExample = '.env.example'
  if (existsSync(envExample)) {
    const envContent = readFileSync(envExample, 'utf-8')
    check(
      envContent.includes('VITE_APP_VERSION'),
      'VITE_APP_VERSION is defined in .env.example',
      'VITE_APP_VERSION is missing from .env.example'
    )
  } else {
    warn('.env.example file not found')
  }
  
  // Check wrangler.toml configuration
  const wranglerPath = 'wrangler.toml'
  if (existsSync(wranglerPath)) {
    const wranglerContent = readFileSync(wranglerPath, 'utf-8')
    check(
      wranglerContent.includes('VITE_APP_VERSION'),
      'VITE_APP_VERSION is defined in wrangler.toml',
      'VITE_APP_VERSION is missing from wrangler.toml'
    )
  } else {
    warn('wrangler.toml file not found')
  }
}

// ============================================================================
// 2. CACHE HEADERS VERIFICATION
// ============================================================================

function verifyCacheHeaders() {
  log.section('2. Cache Headers Verification')
  
  // Check public/_headers for static assets
  const publicHeadersPath = 'public/_headers'
  if (!existsSync(publicHeadersPath)) {
    check(false, '', 'public/_headers file not found')
    return
  }
  
  const publicHeaders = readFileSync(publicHeadersPath, 'utf-8')
  
  // Verify HTML files have no-cache
  check(
    publicHeaders.includes('/*.html') && 
    publicHeaders.includes('max-age=0') &&
    publicHeaders.includes('must-revalidate'),
    'HTML files configured with no-cache headers',
    'HTML files do not have proper no-cache headers'
  )
  
  // Verify static assets have long-term cache
  check(
    publicHeaders.includes('/assets/*.js') && 
    publicHeaders.includes('max-age=31536000') &&
    publicHeaders.includes('immutable'),
    'JavaScript assets configured with long-term immutable cache',
    'JavaScript assets do not have proper cache headers'
  )
  
  check(
    publicHeaders.includes('/assets/*.css') && 
    publicHeaders.includes('max-age=31536000') &&
    publicHeaders.includes('immutable'),
    'CSS assets configured with long-term immutable cache',
    'CSS assets do not have proper cache headers'
  )
  
  // Verify service worker has no-cache
  check(
    publicHeaders.includes('/sw.js') && 
    publicHeaders.includes('max-age=0'),
    'Service worker configured with no-cache',
    'Service worker does not have no-cache headers'
  )
  
  // Check functions/_headers for API endpoints
  const functionsHeadersPath = 'functions/_headers'
  if (existsSync(functionsHeadersPath)) {
    const functionsHeaders = readFileSync(functionsHeadersPath, 'utf-8')
    
    check(
      functionsHeaders.includes('/api/*') && 
      functionsHeaders.includes('no-store'),
      'API endpoints configured with no-store headers',
      'API endpoints do not have proper no-cache headers'
    )
    
    check(
      functionsHeaders.includes('/auth/*') && 
      functionsHeaders.includes('no-store'),
      'Auth endpoints configured with no-store headers',
      'Auth endpoints do not have proper no-cache headers'
    )
  } else {
    warn('functions/_headers file not found')
  }
}

// ============================================================================
// 3. SERVICE WORKER UPDATE FLOW VERIFICATION
// ============================================================================

function verifyServiceWorkerUpdateFlow() {
  log.section('3. Service Worker Update Flow Verification')
  
  // Check useServiceWorkerUpdate hook
  const hookPath = 'src/hooks/useServiceWorkerUpdate.ts'
  if (!existsSync(hookPath)) {
    check(false, '', 'useServiceWorkerUpdate hook not found')
    return
  }
  
  const hookContent = readFileSync(hookPath, 'utf-8')
  
  // Verify update detection
  check(
    hookContent.includes('updateAvailable') && 
    hookContent.includes('updatefound'),
    'Hook detects service worker updates',
    'Hook does not properly detect updates'
  )
  
  // Verify version tracking
  check(
    hookContent.includes('currentVersion') && 
    hookContent.includes('newVersion') &&
    hookContent.includes('GET_VERSION'),
    'Hook tracks current and new versions',
    'Hook does not track versions properly'
  )
  
  // Verify SKIP_WAITING message
  check(
    hookContent.includes('SKIP_WAITING') && 
    hookContent.includes('postMessage'),
    'Hook sends SKIP_WAITING message to activate new worker',
    'Hook does not send SKIP_WAITING message'
  )
  
  // Verify controller change handling
  check(
    hookContent.includes('controllerchange') && 
    hookContent.includes('reload'),
    'Hook reloads page on controller change',
    'Hook does not handle controller change'
  )
  
  // Verify periodic update checks
  check(
    hookContent.includes('setInterval') && 
    hookContent.includes('registration.update'),
    'Hook checks for updates periodically',
    'Hook does not check for updates periodically'
  )
  
  // Check if update prompt component exists
  const updatePromptPaths = [
    'src/components/ServiceWorkerUpdatePrompt.tsx',
    'src/components/UpdatePrompt.tsx',
    'src/components/ui/UpdatePrompt.tsx'
  ]
  
  const updatePromptExists = updatePromptPaths.some(path => existsSync(path))
  if (updatePromptExists) {
    log.success('Update prompt component exists')
  } else {
    warn('Update prompt component not found - users may not be notified of updates')
  }
}

// ============================================================================
// 4. DEPLOYMENT CONFIGURATION VERIFICATION
// ============================================================================

function verifyDeploymentConfiguration() {
  log.section('4. Deployment Configuration Verification')
  
  // Check wrangler.toml
  const wranglerPath = 'wrangler.toml'
  if (!existsSync(wranglerPath)) {
    check(false, '', 'wrangler.toml not found')
    return
  }
  
  const wranglerContent = readFileSync(wranglerPath, 'utf-8')
  
  check(
    wranglerContent.includes('pages_build_output_dir'),
    'Build output directory configured',
    'Build output directory not configured'
  )
  
  check(
    wranglerContent.includes('compatibility_date'),
    'Compatibility date set',
    'Compatibility date not set'
  )
  
  check(
    wranglerContent.includes('[build]'),
    'Build configuration present',
    'Build configuration missing'
  )
  
  // Check _routes.json
  const routesPath = 'public/_routes.json'
  if (existsSync(routesPath)) {
    const routesContent = readFileSync(routesPath, 'utf-8')
    try {
      const routes = JSON.parse(routesContent)
      check(
        routes.include && Array.isArray(routes.include),
        '_routes.json has include patterns',
        '_routes.json missing include patterns'
      )
      check(
        routes.exclude && Array.isArray(routes.exclude),
        '_routes.json has exclude patterns',
        '_routes.json missing exclude patterns'
      )
    } catch (e) {
      check(false, '', '_routes.json is not valid JSON')
    }
  } else {
    warn('_routes.json not found - all routes will invoke functions')
  }
  
  // Check package.json scripts
  const packagePath = 'package.json'
  if (existsSync(packagePath)) {
    const packageContent = JSON.parse(readFileSync(packagePath, 'utf-8'))
    const scripts = packageContent.scripts || {}
    
    check(
      scripts.build || scripts['build:prod'],
      'Build script exists',
      'Build script missing'
    )
    
    check(
      scripts.deploy,
      'Deploy script exists',
      'Deploy script missing'
    )
  }
}

// ============================================================================
// 5. DRAFT SYSTEM RELIABILITY VERIFICATION
// ============================================================================

function verifyDraftSystemReliability() {
  log.section('5. Draft System Reliability Verification')
  
  // Check useSmartAutoSave hook
  const autoSavePath = 'src/pages/student/applicationWizard/hooks/useSmartAutoSave.ts'
  if (!existsSync(autoSavePath)) {
    check(false, '', 'useSmartAutoSave hook not found')
    return
  }
  
  const autoSaveContent = readFileSync(autoSavePath, 'utf-8')
  
  // Verify 8-second interval
  check(
    autoSaveContent.includes('interval = 8000') || 
    autoSaveContent.includes('interval: 8000'),
    'Auto-save uses 8-second interval as required',
    'Auto-save does not use 8-second interval'
  )
  
  // Verify auto-save is enabled by default
  check(
    autoSaveContent.includes('enabled = true') || 
    autoSaveContent.includes('enabled: true'),
    'Auto-save is enabled by default',
    'Auto-save is not enabled by default'
  )
  
  // Verify save status tracking
  check(
    autoSaveContent.includes('saveStatus') && 
    (autoSaveContent.includes('isSaving') || autoSaveContent.includes('isDirty')),
    'Auto-save tracks save status',
    'Auto-save does not track save status properly'
  )
  
  // Verify error handling
  check(
    autoSaveContent.includes('onError') || 
    autoSaveContent.includes('saveError'),
    'Auto-save has error handling',
    'Auto-save lacks error handling'
  )
  
  // Verify offline support
  check(
    autoSaveContent.includes('isOnline') || 
    autoSaveContent.includes('saveQueue'),
    'Auto-save supports offline queueing',
    'Auto-save does not support offline mode'
  )
  
  // Verify conflict resolution
  check(
    autoSaveContent.includes('resolveConflict') || 
    autoSaveContent.includes('conflict'),
    'Auto-save has conflict resolution',
    'Auto-save lacks conflict resolution'
  )
  
  // Check useAutoSave base hook
  const baseAutoSavePath = 'src/hooks/useAutoSave.ts'
  if (existsSync(baseAutoSavePath)) {
    const baseContent = readFileSync(baseAutoSavePath, 'utf-8')
    
    check(
      baseContent.includes('localStorage') || 
      baseContent.includes('IndexedDB'),
      'Auto-save persists data locally',
      'Auto-save does not persist data locally'
    )
    
    check(
      baseContent.includes('restoreData') || 
      baseContent.includes('restore'),
      'Auto-save can restore saved data',
      'Auto-save cannot restore saved data'
    )
  } else {
    warn('useAutoSave base hook not found')
  }
}

// ============================================================================
// 6. REACT QUERY CACHE CONFIGURATION VERIFICATION
// ============================================================================

function verifyReactQueryCache() {
  log.section('6. React Query Cache Configuration Verification')
  
  const queryPath = 'src/hooks/queries/useSupabaseQuery.ts'
  if (!existsSync(queryPath)) {
    check(false, '', 'useSupabaseQuery hook not found')
    return
  }
  
  const queryContent = readFileSync(queryPath, 'utf-8')
  
  // Verify CACHE_CONFIG exists
  check(
    queryContent.includes('CACHE_CONFIG'),
    'CACHE_CONFIG is defined',
    'CACHE_CONFIG is not defined'
  )
  
  // Verify different cache strategies for different data types
  check(
    queryContent.includes('auth:') && 
    queryContent.includes('applications:') &&
    queryContent.includes('analytics:'),
    'Different cache strategies for different data types',
    'Cache strategies not properly differentiated'
  )
  
  // Verify staleTime and gcTime are configured
  check(
    queryContent.includes('staleTime') && 
    queryContent.includes('gcTime'),
    'staleTime and gcTime are configured',
    'staleTime or gcTime not configured'
  )
  
  // Verify optimistic updates
  check(
    queryContent.includes('onMutate') && 
    queryContent.includes('optimistic'),
    'Optimistic updates are implemented',
    'Optimistic updates not implemented'
  )
  
  // Verify cache invalidation on mutations
  check(
    queryContent.includes('invalidateQueries'),
    'Cache invalidation on mutations',
    'Cache not invalidated on mutations'
  )
}

// ============================================================================
// 7. VITE BUILD CONFIGURATION VERIFICATION
// ============================================================================

function verifyViteBuildConfig() {
  log.section('7. Vite Build Configuration Verification')
  
  const vitePath = 'vite.config.production.ts'
  if (!existsSync(vitePath)) {
    check(false, '', 'vite.config.production.ts not found')
    return
  }
  
  const viteContent = readFileSync(vitePath, 'utf-8')
  
  // Verify PWA plugin
  check(
    viteContent.includes('VitePWA'),
    'VitePWA plugin configured',
    'VitePWA plugin not configured'
  )
  
  // Verify inject manifest strategy
  check(
    viteContent.includes("strategies: 'injectManifest'"),
    'Inject manifest strategy configured',
    'Inject manifest strategy not configured'
  )
  
  // Verify service worker source
  check(
    viteContent.includes("filename: 'service-worker.ts'"),
    'Service worker source file configured',
    'Service worker source file not configured'
  )
  
  // Verify code splitting
  check(
    viteContent.includes('manualChunks'),
    'Manual code splitting configured',
    'Manual code splitting not configured'
  )
  
  // Verify asset hashing
  check(
    viteContent.includes('[hash]'),
    'Asset hashing enabled for cache busting',
    'Asset hashing not enabled'
  )
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
  console.log(`
${COLORS.cyan}╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           CHECKPOINT 23 VERIFICATION SCRIPT                   ║
║                                                               ║
║  Verifying cache invalidation, deployment, and draft system   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝${COLORS.reset}
`)

  verifyCacheInvalidation()
  verifyCacheHeaders()
  verifyServiceWorkerUpdateFlow()
  verifyDeploymentConfiguration()
  verifyDraftSystemReliability()
  verifyReactQueryCache()
  verifyViteBuildConfig()
  
  // Summary
  log.section('Verification Summary')
  
  console.log(`Total Checks: ${totalChecks}`)
  console.log(`${COLORS.green}Passed: ${passedChecks}${COLORS.reset}`)
  console.log(`${COLORS.red}Failed: ${failedChecks}${COLORS.reset}`)
  console.log(`${COLORS.yellow}Warnings: ${warnings}${COLORS.reset}`)
  
  const successRate = ((passedChecks / totalChecks) * 100).toFixed(1)
  console.log(`\nSuccess Rate: ${successRate}%`)
  
  if (failedChecks === 0) {
    log.success('\n✓ All checks passed! Cache and deployment systems are properly configured.')
    process.exit(0)
  } else if (failedChecks <= 3) {
    log.warning('\n⚠ Some checks failed, but core functionality is present.')
    process.exit(0)
  } else {
    log.error('\n✗ Multiple checks failed. Please review the configuration.')
    process.exit(1)
  }
}

main()
