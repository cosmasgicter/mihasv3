// Comprehensive function testing script
const BASE_URL = 'https://apply.mihas.edu.zm/.netlify/functions'

// Test credentials
const STUDENT_CREDS = {
  email: 'alexisstar8@gmail.com',
  password: 'Skyl3r@L0m1s'
}

const ADMIN_CREDS = {
  email: 'cosmas@beanola.com', 
  password: 'Beanola@2025'
}

async function testFunction(name, url, options = {}) {
  try {
    console.log(`\n🧪 Testing ${name}...`)
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    const status = response.status
    const statusText = response.statusText
    
    let data
    try {
      data = await response.json()
    } catch {
      data = await response.text()
    }

    if (status >= 200 && status < 300) {
      console.log(`✅ ${name}: ${status} ${statusText}`)
      return { success: true, status, data }
    } else {
      console.log(`❌ ${name}: ${status} ${statusText}`)
      console.log(`   Error: ${JSON.stringify(data, null, 2)}`)
      return { success: false, status, data }
    }
  } catch (error) {
    console.log(`💥 ${name}: Network Error`)
    console.log(`   ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function authenticateUser(credentials, userType) {
  console.log(`\n🔐 Authenticating ${userType}...`)
  const result = await testFunction(
    `${userType} Login`,
    `${BASE_URL}/auth-login`,
    {
      method: 'POST',
      body: credentials
    }
  )
  
  if (result.success && result.data.session?.access_token) {
    console.log(`✅ ${userType} authenticated successfully`)
    return result.data.session.access_token
  } else {
    console.log(`❌ ${userType} authentication failed`)
    return null
  }
}

async function runTests() {
  console.log('🚀 Starting MIHAS Function Tests')
  console.log('=' .repeat(50))

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
  }

  // Test 1: Health Check
  const healthTest = await testFunction('Health Check', `${BASE_URL}/health`)
  results.total++
  if (healthTest.success) results.passed++; else results.failed++
  results.tests.push({ name: 'Health Check', ...healthTest })

  // Test 2: Catalog Functions
  const programsTest = await testFunction('Programs Catalog', `${BASE_URL}/catalog-programs`)
  results.total++
  if (programsTest.success) results.passed++; else results.failed++
  results.tests.push({ name: 'Programs Catalog', ...programsTest })

  const intakesTest = await testFunction('Intakes Catalog', `${BASE_URL}/catalog-intakes`)
  results.total++
  if (intakesTest.success) results.passed++; else results.failed++
  results.tests.push({ name: 'Intakes Catalog', ...intakesTest })

  const subjectsTest = await testFunction('Subjects Catalog', `${BASE_URL}/catalog-subjects`)
  results.total++
  if (subjectsTest.success) results.passed++; else results.failed++
  results.tests.push({ name: 'Subjects Catalog', ...subjectsTest })

  // Test 3: Authentication
  const studentToken = await authenticateUser(STUDENT_CREDS, 'Student')
  const adminToken = await authenticateUser(ADMIN_CREDS, 'Admin')

  // Test 4: Document Upload (with auth)
  if (studentToken) {
    const uploadTest = await testFunction(
      'Document Upload',
      `${BASE_URL}/documents-upload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          fileName: 'test-document.pdf',
          fileType: 'application/pdf',
          fileSize: 1024000
        }
      }
    )
    results.total++
    if (uploadTest.success) results.passed++; else results.failed++
    results.tests.push({ name: 'Document Upload', ...uploadTest })
  }

  // Test 5: Admin Functions (with admin auth)
  if (adminToken) {
    const adminTests = [
      {
        name: 'Admin Dashboard',
        url: `${BASE_URL}/admin-dashboard`,
        method: 'GET'
      },
      {
        name: 'Admin Queue Status',
        url: `${BASE_URL}/admin-queue-status`,
        method: 'GET'
      },
      {
        name: 'Admin Audit Export',
        url: `${BASE_URL}/admin-audit-log-export`,
        method: 'GET'
      },
      {
        name: 'User Permissions',
        url: `${BASE_URL}/admin-users-permissions?id=test-user`,
        method: 'GET'
      }
    ]

    for (const test of adminTests) {
      const result = await testFunction(
        test.name,
        test.url,
        {
          method: test.method,
          headers: { Authorization: `Bearer ${adminToken}` }
        }
      )
      results.total++
      if (result.success) results.passed++; else results.failed++
      results.tests.push({ name: test.name, ...result })
    }
  }

  // Test 6: MCP Query
  const mcpTest = await testFunction(
    'MCP Query',
    `${BASE_URL}/mcp-query`,
    {
      method: 'POST',
      body: { query: 'show applications', context: 'test' }
    }
  )
  results.total++
  if (mcpTest.success) results.passed++; else results.failed++
  results.tests.push({ name: 'MCP Query', ...mcpTest })

  // Test 7: Notification Functions
  const notificationTests = [
    {
      name: 'Process Email Queue',
      url: `${BASE_URL}/notifications-process-email-queue`,
      method: 'POST'
    },
    {
      name: 'Dispatch Channel',
      url: `${BASE_URL}/notifications-dispatch-channel`,
      method: 'POST'
    }
  ]

  for (const test of notificationTests) {
    const result = await testFunction(
      test.name,
      test.url,
      {
        method: test.method,
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
      }
    )
    results.total++
    if (result.success) results.passed++; else results.failed++
    results.tests.push({ name: test.name, ...result })
  }

  // Print Results Summary
  console.log('\n' + '=' .repeat(50))
  console.log('📊 TEST RESULTS SUMMARY')
  console.log('=' .repeat(50))
  console.log(`Total Tests: ${results.total}`)
  console.log(`✅ Passed: ${results.passed}`)
  console.log(`❌ Failed: ${results.failed}`)
  console.log(`📈 Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`)

  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:')
    results.tests
      .filter(test => !test.success)
      .forEach(test => {
        console.log(`   • ${test.name}: ${test.status || 'Network Error'}`)
      })
  }

  console.log('\n🎯 ENGINEERING ASSESSMENT:')
  if (results.passed === results.total) {
    console.log('✅ ALL FUNCTIONS OPERATIONAL - 100% SUCCESS RATE')
    console.log('🚀 System ready for production use')
  } else if (results.passed / results.total >= 0.8) {
    console.log('⚠️  MOSTLY OPERATIONAL - Minor issues detected')
    console.log('🔧 Recommend addressing failed functions')
  } else {
    console.log('❌ CRITICAL ISSUES - Multiple function failures')
    console.log('🚨 Immediate attention required')
  }

  return results
}

// Run the tests
runTests().catch(console.error)