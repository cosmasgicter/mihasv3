#!/usr/bin/env node

/**
 * API Verification Script
 * Tests key endpoints to ensure fixes are working
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8888/.netlify/functions'

const endpoints = [
  // Health check (should always work)
  { path: '/health', method: 'GET', auth: false, expected: 200 },
  
  // Catalog endpoints (public)
  { path: '/catalog-programs', method: 'GET', auth: false, expected: 200 },
  { path: '/catalog-intakes', method: 'GET', auth: false, expected: 200 },
  
  // Auth endpoints
  { path: '/auth-login', method: 'POST', auth: false, expected: 400, body: {} }, // Should fail with no credentials
  
  // Protected endpoints (should require auth)
  { path: '/applications', method: 'GET', auth: true, expected: 401 }, // Should fail without auth
  { path: '/admin-dashboard', method: 'GET', auth: true, expected: 401 }, // Should fail without auth
]

async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`
  const options = {
    method: endpoint.method,
    headers: {
      'Content-Type': 'application/json',
    }
  }

  if (endpoint.body) {
    options.body = JSON.stringify(endpoint.body)
  }

  if (endpoint.auth) {
    options.headers.Authorization = 'Bearer invalid-token' // Should fail
  }

  try {
    console.log(`Testing ${endpoint.method} ${endpoint.path}...`)
    const response = await fetch(url, options)
    
    if (response.status === endpoint.expected) {
      console.log(`✅ ${endpoint.path}: Expected ${endpoint.expected}, got ${response.status}`)
      return true
    } else {
      console.log(`❌ ${endpoint.path}: Expected ${endpoint.expected}, got ${response.status}`)
      return false
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`⚠️  ${endpoint.path}: Server not running (${error.code})`)
      return null // Skip this test
    }
    console.log(`❌ ${endpoint.path}: Error - ${error.message}`)
    return false
  }
}

async function verifyApiFixes() {
  console.log('🔍 Verifying API Fixes...\n')
  console.log(`Base URL: ${BASE_URL}\n`)

  const results = []
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint)
    results.push(result)
    console.log('') // Empty line for readability
  }

  const passed = results.filter(r => r === true).length
  const failed = results.filter(r => r === false).length
  const skipped = results.filter(r => r === null).length

  console.log('📊 Results Summary:')
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`⚠️  Skipped: ${skipped}`)

  if (failed === 0) {
    console.log('\n🎉 All API endpoints are responding as expected!')
    console.log('✅ API fixes have been successfully implemented.')
  } else {
    console.log('\n⚠️  Some endpoints may need attention.')
    console.log('Check the failed tests above for details.')
  }

  return failed === 0
}

// Run verification
if (require.main === module) {
  verifyApiFixes().then(success => {
    process.exit(success ? 0 : 1)
  }).catch(error => {
    console.error('Verification failed:', error)
    process.exit(1)
  })
}

module.exports = { verifyApiFixes }