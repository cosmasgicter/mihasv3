/**
 * Verification Script for Keyboard Navigation Implementation
 * Checks that all necessary files and code changes are in place
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

console.log('🔍 Verifying Keyboard Navigation Implementation\n')

let allPassed = true
const results = []

function checkFile(filePath, description) {
  const fullPath = path.join(rootDir, filePath)
  const exists = fs.existsSync(fullPath)
  
  if (exists) {
    console.log(`✅ ${description}`)
    results.push({ test: description, passed: true })
  } else {
    console.log(`❌ ${description}`)
    results.push({ test: description, passed: false })
    allPassed = false
  }
  
  return exists
}

function checkFileContains(filePath, searchString, description) {
  const fullPath = path.join(rootDir, filePath)
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${description} - File not found`)
    results.push({ test: description, passed: false })
    allPassed = false
    return false
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8')
  const contains = content.includes(searchString)
  
  if (contains) {
    console.log(`✅ ${description}`)
    results.push({ test: description, passed: true })
  } else {
    console.log(`❌ ${description}`)
    results.push({ test: description, passed: false })
    allPassed = false
  }
  
  return contains
}

console.log('📋 Checking Required Files...\n')

// Check SkipLink component
checkFile('src/components/ui/SkipLink.tsx', 'SkipLink component exists')

// Check AppLayout modifications
checkFile('src/components/navigation/AppLayout.tsx', 'AppLayout component exists')

// Check CSS modifications
checkFile('src/index.css', 'Main CSS file exists')

// Check test files
checkFile('tests/accessibility/keyboard-navigation.spec.ts', 'Automated tests created')
checkFile('tests/accessibility/keyboard-navigation-manual-checklist.md', 'Manual testing checklist created')
checkFile('scripts/test-keyboard-navigation.js', 'Testing script created')

// Check documentation
checkFile('docs/accessibility/KEYBOARD_NAVIGATION_IMPLEMENTATION.md', 'Implementation documentation created')

console.log('\n📋 Checking Code Implementation...\n')

// Check SkipLink import in AppLayout
checkFileContains(
  'src/components/navigation/AppLayout.tsx',
  'import { SkipLink }',
  'SkipLink imported in AppLayout'
)

// Check SkipLink usage in AppLayout
checkFileContains(
  'src/components/navigation/AppLayout.tsx',
  '<SkipLink />',
  'SkipLink component used in AppLayout'
)

// Check main-content ID in AppLayout
checkFileContains(
  'src/components/navigation/AppLayout.tsx',
  'id="main-content"',
  'main-content ID added to main element'
)

// Check skip-link CSS
checkFileContains(
  'src/index.css',
  '.skip-link',
  'skip-link CSS class defined'
)

// Check skip-link focus styles
checkFileContains(
  'src/index.css',
  'focus:translate-y-0',
  'skip-link focus styles defined'
)

// Check SkipLink export in index
checkFileContains(
  'src/components/ui/index.ts',
  "export { SkipLink } from './SkipLink'",
  'SkipLink exported from ui/index'
)

console.log('\n📋 Checking ARIA Labels in Admin Pages...\n')

// Check Applications page has aria-labels
checkFileContains(
  'src/pages/admin/ApplicationsAdmin.tsx',
  'aria-label',
  'Applications page has aria-labels'
)

// Check EligibilityManagement page has aria-labels
checkFileContains(
  'src/pages/admin/EligibilityManagement.tsx',
  'aria-label',
  'Eligibility Management page has aria-labels'
)

console.log('\n' + '='.repeat(60))
console.log('📊 VERIFICATION SUMMARY')
console.log('='.repeat(60))

const passed = results.filter(r => r.passed).length
const failed = results.filter(r => !r.passed).length

console.log(`\n✅ Passed: ${passed}/${results.length}`)
console.log(`❌ Failed: ${failed}/${results.length}`)

if (failed > 0) {
  console.log('\n❌ Failed Tests:')
  results
    .filter(r => !r.passed)
    .forEach(r => console.log(`  - ${r.test}`))
}

console.log('\n' + '='.repeat(60))

if (allPassed) {
  console.log('✅ All verification checks passed!')
  console.log('\n📝 Next Steps:')
  console.log('  1. Run manual testing checklist')
  console.log('  2. Test keyboard navigation in browser')
  console.log('  3. Verify skip link functionality')
  console.log('  4. Test all admin pages with keyboard only')
  process.exit(0)
} else {
  console.log('❌ Some verification checks failed!')
  console.log('\n📝 Please fix the failed checks and run again.')
  process.exit(1)
}
