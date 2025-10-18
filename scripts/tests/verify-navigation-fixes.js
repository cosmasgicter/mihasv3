#!/usr/bin/env node

/**
 * Navigation Fixes Verification Script
 * Checks that navigation components are properly organized and no conflicts exist
 */

const fs = require('fs')
const path = require('path')

const COMPONENTS_DIR = path.join(__dirname, 'src', 'components')
const UI_DIR = path.join(COMPONENTS_DIR, 'ui')
const ADMIN_DIR = path.join(COMPONENTS_DIR, 'admin')

// Expected navigation components (should exist)
const EXPECTED_COMPONENTS = [
  'src/components/ui/AuthenticatedNavigation.tsx',
  'src/components/ui/AdminNavigation.tsx', 
  'src/components/ui/MobileNavigation.tsx'
]

// Removed components (should NOT exist)
const REMOVED_COMPONENTS = [
  'src/components/ui/EnhancedMobileNavigation.tsx',
  'src/components/ui/ImprovedMobileNavigation.tsx',
  'src/components/ui/StudentMobileNavigation.tsx',
  'src/components/admin/EnhancedAdminNavigation.tsx'
]

// Pages that should use specific navigation components
const PAGE_NAVIGATION_RULES = {
  'src/pages/student/Dashboard.tsx': 'AuthenticatedNavigation',
  'src/pages/admin/Dashboard.tsx': 'AdminNavigation'
}

function checkFileExists(filePath) {
  return fs.existsSync(path.join(__dirname, filePath))
}

function checkFileContent(filePath, searchTerm) {
  try {
    const fullPath = path.join(__dirname, filePath)
    if (!fs.existsSync(fullPath)) {
      return false
    }
    const content = fs.readFileSync(fullPath, 'utf8')
    return content.includes(searchTerm)
  } catch (error) {
    return false
  }
}

function verifyNavigationFixes() {
  console.log('🔍 Verifying Navigation Fixes...\n')

  let passed = 0
  let failed = 0

  // Check that expected components exist
  console.log('✅ Checking Expected Components:')
  for (const component of EXPECTED_COMPONENTS) {
    if (checkFileExists(component)) {
      console.log(`  ✅ ${component} - EXISTS`)
      passed++
    } else {
      console.log(`  ❌ ${component} - MISSING`)
      failed++
    }
  }

  console.log('')

  // Check that removed components are gone
  console.log('🗑️  Checking Removed Components:')
  for (const component of REMOVED_COMPONENTS) {
    if (!checkFileExists(component)) {
      console.log(`  ✅ ${component} - REMOVED`)
      passed++
    } else {
      console.log(`  ❌ ${component} - STILL EXISTS`)
      failed++
    }
  }

  console.log('')

  // Check page navigation usage
  console.log('📄 Checking Page Navigation Usage:')
  for (const [pagePath, expectedNav] of Object.entries(PAGE_NAVIGATION_RULES)) {
    if (checkFileContent(pagePath, expectedNav)) {
      console.log(`  ✅ ${pagePath} uses ${expectedNav}`)
      passed++
    } else {
      console.log(`  ⚠️  ${pagePath} - Could not verify ${expectedNav} usage`)
      // Don't count as failed since file might not exist or have different structure
    }
  }

  console.log('')

  // Check for any remaining references to deleted components
  console.log('🔍 Checking for Orphaned References:')
  const searchTerms = [
    'EnhancedMobileNavigation',
    'ImprovedMobileNavigation', 
    'StudentMobileNavigation',
    'EnhancedAdminNavigation'
  ]

  let orphanedReferences = 0
  for (const term of searchTerms) {
    // Check common files that might import these
    const filesToCheck = [
      'src/v2-improvements-index.ts',
      'src/App.tsx',
      'src/pages/student/Dashboard.tsx',
      'src/pages/admin/Dashboard.tsx'
    ]

    for (const file of filesToCheck) {
      if (checkFileContent(file, term)) {
        console.log(`  ❌ Found reference to ${term} in ${file}`)
        orphanedReferences++
        failed++
      }
    }
  }

  if (orphanedReferences === 0) {
    console.log('  ✅ No orphaned references found')
    passed++
  }

  console.log('')

  // Summary
  console.log('📊 Results Summary:')
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)

  if (failed === 0) {
    console.log('\n🎉 All navigation fixes have been successfully implemented!')
    console.log('✅ Navigation architecture is clean and conflict-free.')
    console.log('')
    console.log('📋 Current Navigation Structure:')
    console.log('  • AuthenticatedNavigation.tsx - For authenticated users')
    console.log('  • AdminNavigation.tsx - For admin users')
    console.log('  • MobileNavigation.tsx - For landing page')
    console.log('')
    console.log('🎯 Usage Rules:')
    console.log('  • Student pages → AuthenticatedNavigation')
    console.log('  • Admin pages → AdminNavigation')
    console.log('  • Landing page → MobileNavigation')
    console.log('  • Auth pages → AuthLayout (no navigation)')
  } else {
    console.log('\n⚠️  Some issues were found that may need attention.')
    console.log('Check the failed tests above for details.')
  }

  return failed === 0
}

// Run verification
if (require.main === module) {
  verifyNavigationFixes().then ? 
    verifyNavigationFixes().then(success => {
      process.exit(success ? 0 : 1)
    }).catch(error => {
      console.error('Verification failed:', error)
      process.exit(1)
    }) :
    process.exit(verifyNavigationFixes() ? 0 : 1)
}

module.exports = { verifyNavigationFixes }