/**
 * Cache Invalidation Verification Script
 * 
 * Verifies that cache invalidation is properly configured:
 * - VITE_APP_VERSION is set in environment files
 * - Service worker uses version in cache keys
 * - Cache headers are configured correctly
 * - Update prompt component exists
 * 
 * Run: node scripts/verify-cache-invalidation.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const results = {
  passed: [],
  failed: [],
  warnings: []
}

function checkFile(filePath, description) {
  const fullPath = path.join(rootDir, filePath)
  if (fs.existsSync(fullPath)) {
    results.passed.push(`✓ ${description}: ${filePath}`)
    return true
  } else {
    results.failed.push(`✗ ${description}: ${filePath} not found`)
    return false
  }
}

function checkFileContent(filePath, searchString, description) {
  const fullPath = path.join(rootDir, filePath)
  if (!fs.existsSync(fullPath)) {
    results.failed.push(`✗ ${description}: ${filePath} not found`)
    return false
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8')
  if (content.includes(searchString)) {
    results.passed.push(`✓ ${description}`)
    return true
  } else {
    results.failed.push(`✗ ${description}: "${searchString}" not found in ${filePath}`)
    return false
  }
}

console.log('🔍 Verifying Cache Invalidation Configuration...\n')

// Check 1: Environment files have VITE_APP_VERSION
console.log('📋 Checking environment configuration...')
checkFileContent('.env.example', 'VITE_APP_VERSION', 'VITE_APP_VERSION in .env.example')
checkFileContent('.env.development', 'VITE_APP_VERSION', 'VITE_APP_VERSION in .env.development')
checkFileContent('.env.production', 'VITE_APP_VERSION', 'VITE_APP_VERSION in .env.production')

// Check 2: Service worker uses version
console.log('\n📋 Checking service worker configuration...')
checkFileContent(
  'src/service-worker.ts',
  'import.meta.env.VITE_APP_VERSION',
  'Service worker uses VITE_APP_VERSION'
)
checkFileContent(
  'src/service-worker.ts',
  'CACHE_VERSION',
  'Service worker defines CACHE_VERSION'
)
checkFileContent(
  'src/service-worker.ts',
  'SKIP_WAITING',
  'Service worker handles SKIP_WAITING message'
)
checkFileContent(
  'src/service-worker.ts',
  'GET_VERSION',
  'Service worker handles GET_VERSION message'
)
checkFileContent(
  'src/service-worker.ts',
  'CLEAR_CACHE',
  'Service worker handles CLEAR_CACHE message'
)

// Check 3: Cache headers configured
console.log('\n📋 Checking cache headers...')
checkFile('public/_headers', 'Public cache headers file')
checkFile('functions/_headers', 'Functions cache headers file')
checkFileContent(
  'public/_headers',
  'Cache-Control: no-cache, no-store, must-revalidate',
  'HTML no-cache headers'
)
checkFileContent(
  'public/_headers',
  'Cache-Control: public, max-age=31536000, immutable',
  'Immutable asset headers'
)

// Check 4: Update prompt component
console.log('\n📋 Checking update prompt implementation...')
checkFile('src/hooks/useServiceWorkerUpdate.ts', 'Service worker update hook')
checkFile('src/components/ServiceWorkerUpdatePrompt.tsx', 'Update prompt component')
checkFileContent(
  'src/App.tsx',
  'ServiceWorkerUpdatePrompt',
  'Update prompt integrated in App'
)

// Check 5: Cache monitoring
console.log('\n📋 Checking cache monitoring...')
checkFileContent(
  'src/services/cacheMonitor.ts',
  'ServiceWorkerCacheMetrics',
  'Service worker cache metrics interface'
)
checkFileContent(
  'src/services/cacheMonitor.ts',
  'collectServiceWorkerMetrics',
  'Service worker metrics collection'
)
checkFileContent(
  'src/services/cacheMonitor.ts',
  'staleContentDetected',
  'Stale content detection'
)

// Check 6: Test file exists
console.log('\n📋 Checking tests...')
checkFile('tests/integration/cache-invalidation.spec.ts', 'Cache invalidation tests')

// Print results
console.log('\n' + '='.repeat(60))
console.log('📊 VERIFICATION RESULTS')
console.log('='.repeat(60))

if (results.passed.length > 0) {
  console.log('\n✅ PASSED (' + results.passed.length + '):')
  results.passed.forEach(msg => console.log('  ' + msg))
}

if (results.warnings.length > 0) {
  console.log('\n⚠️  WARNINGS (' + results.warnings.length + '):')
  results.warnings.forEach(msg => console.log('  ' + msg))
}

if (results.failed.length > 0) {
  console.log('\n❌ FAILED (' + results.failed.length + '):')
  results.failed.forEach(msg => console.log('  ' + msg))
}

console.log('\n' + '='.repeat(60))

const totalChecks = results.passed.length + results.failed.length + results.warnings.length
const passRate = ((results.passed.length / totalChecks) * 100).toFixed(1)

console.log(`\n📈 Pass Rate: ${passRate}% (${results.passed.length}/${totalChecks})`)

if (results.failed.length === 0) {
  console.log('\n✨ All cache invalidation checks passed!')
  console.log('\n📝 Next steps:')
  console.log('  1. Update VITE_APP_VERSION in .env files when deploying')
  console.log('  2. Build and deploy: npm run build:prod && npm run deploy')
  console.log('  3. Verify users see update prompt after deployment')
  console.log('  4. Monitor cache metrics in production')
  process.exit(0)
} else {
  console.log('\n⚠️  Some checks failed. Please review and fix the issues above.')
  process.exit(1)
}
