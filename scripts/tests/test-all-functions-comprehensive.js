// Comprehensive test of all Netlify functions
const baseUrl = 'https://mihasv3.pages.dev'

const allFunctions = [
  // Health & System
  { name: 'Health Check', url: `${baseUrl}/api/health`, method: 'GET' },
  { name: 'Test Function', url: `${baseUrl}/api/test`, method: 'GET' },

  // Authentication
  { name: 'Auth Login', url: `${baseUrl}/api/auth/login`, method: 'POST', 
    body: { email: 'test@test.com', password: 'test123' } },
  { name: 'Auth Register', url: `${baseUrl}/api/auth/register`, method: 'POST',
    body: { email: 'test@test.com', password: 'test123', full_name: 'Test User' } },
  { name: 'Auth Reset Password', url: `${baseUrl}/api/auth/reset-password`, method: 'POST',
    body: { email: 'test@test.com' } },

  // Applications
  { name: 'Applications List', url: `${baseUrl}/api/applications`, method: 'GET', requireAuth: true },
  { name: 'Application Get', url: `${baseUrl}/api/applications/test-id`, method: 'GET', requireAuth: true },
  { name: 'Application Update', url: `${baseUrl}/api/applications/test-id`, method: 'PATCH', requireAuth: true,
    body: { action: 'update_payment_status', paymentStatus: 'verified' } },
  { name: 'Generate Slip', url: `${baseUrl}/api/applications/generate-slip`, method: 'POST', requireAuth: true,
    body: { applicationId: 'test-id' } },
  { name: 'Email Slip', url: `${baseUrl}/api/applications/email-slip`, method: 'POST', requireAuth: true,
    body: { applicationId: 'test-id' } },

  // Catalog
  { name: 'Programs', url: `${baseUrl}/api/catalog/programs`, method: 'GET' },
  { name: 'Intakes', url: `${baseUrl}/api/catalog/intakes`, method: 'GET' },
  { name: 'Subjects', url: `${baseUrl}/api/catalog/subjects`, method: 'GET' },

  // Documents
  { name: 'Document Upload', url: `${baseUrl}/api/documents/upload`, method: 'POST', requireAuth: true,
    body: { file: 'test-file-data', type: 'result_slip' } },

  // Analytics
  { name: 'Analytics Telemetry', url: `${baseUrl}/api/analytics/telemetry`, method: 'GET', requireAuth: true },
  { name: 'Predictive Dashboard', url: `${baseUrl}/api/analytics/predictive-dashboard`, method: 'GET', requireAuth: true },

  // Admin Functions
  { name: 'Admin Dashboard', url: `${baseUrl}/api/admin/dashboard`, method: 'GET', requireAuth: true },
  { name: 'Admin Users', url: `${baseUrl}/api/admin/users/test-id`, method: 'GET', requireAuth: true },
  { name: 'Admin User Role', url: `${baseUrl}/api/admin/users/test-id/role`, method: 'PUT', requireAuth: true,
    body: { role: 'admin' } },
  { name: 'Admin User Permissions', url: `${baseUrl}/api/admin/users/test-id/permissions`, method: 'GET', requireAuth: true },
  { name: 'Admin Queue Status', url: `${baseUrl}/api/admin/queue-status`, method: 'GET', requireAuth: true },
  { name: 'Admin Audit Log Stats', url: `${baseUrl}/api/admin/audit-log/stats`, method: 'GET', requireAuth: true },
  { name: 'Admin Audit Log Export', url: `${baseUrl}/api/admin/audit-log/export`, method: 'GET', requireAuth: true },

  // Notifications
  { name: 'Send Notification', url: `${baseUrl}/api/notifications/send`, method: 'POST', requireAuth: true,
    body: { title: 'Test', message: 'Test message', userId: 'test-id' } },
  { name: 'Application Submitted Notification', url: `${baseUrl}/api/notifications/application-submitted`, method: 'POST', requireAuth: true,
    body: { applicationId: 'test-id' } },
  { name: 'Dispatch Channel', url: `${baseUrl}/api/notifications/dispatch-channel`, method: 'POST', requireAuth: true,
    body: { channel: 'email', message: 'test' } },
  { name: 'Process Email Queue', url: `${baseUrl}/api/notifications/process-email-queue`, method: 'POST', requireAuth: true },

  // Push Subscriptions
  { name: 'Push Subscriptions', url: `${baseUrl}/api/push-subscriptions`, method: 'GET', requireAuth: true },

  // User Consents
  { name: 'User Consents', url: `${baseUrl}/api/user-consents`, method: 'GET', requireAuth: true },

  // MCP
  { name: 'MCP Query', url: `${baseUrl}/api/mcp/query`, method: 'POST', requireAuth: true,
    body: { query: 'test query' } }
]

async function testFunction(func) {
  console.log(`\n🧪 Testing: ${func.name}`)
  console.log(`   URL: ${func.url}`)
  console.log(`   Method: ${func.method}`)
  
  try {
    const options = {
      method: func.method,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    
    // Add auth header if required
    if (func.requireAuth) {
      options.headers['Authorization'] = 'Bearer fake-token-for-testing'
    }
    
    // Add body if provided
    if (func.body) {
      options.body = JSON.stringify(func.body)
    }
    
    const response = await fetch(func.url, options)
    const text = await response.text()
    
    console.log(`   Status: ${response.status} ${response.statusText}`)
    
    // Categorize responses
    if (response.status >= 500) {
      console.log('   ❌ SERVER ERROR')
      console.log(`   Response: ${text.substring(0, 200)}...`)
      return { status: 'server_error', code: response.status, error: text }
    } else if (response.status === 502) {
      console.log('   ❌ BAD GATEWAY (Function Error)')
      console.log(`   Response: ${text.substring(0, 200)}...`)
      return { status: 'function_error', code: response.status, error: text }
    } else if (response.status === 401 || response.status === 403) {
      console.log('   🔒 AUTH ERROR (Expected for test tokens)')
      return { status: 'auth_error', code: response.status }
    } else if (response.status >= 400) {
      console.log('   ⚠️  CLIENT ERROR')
      try {
        const json = JSON.parse(text)
        console.log(`   Error: ${json.error || 'Unknown error'}`)
      } catch {
        console.log(`   Response: ${text.substring(0, 100)}...`)
      }
      return { status: 'client_error', code: response.status }
    } else {
      console.log('   ✅ SUCCESS')
      try {
        const json = JSON.parse(text)
        console.log(`   Data keys: ${Object.keys(json).join(', ')}`)
      } catch {
        console.log(`   Response: ${text.substring(0, 100)}...`)
      }
      return { status: 'success', code: response.status }
    }
  } catch (error) {
    console.log('   ❌ NETWORK ERROR')
    console.log(`   Error: ${error.message}`)
    return { status: 'network_error', error: error.message }
  }
}

async function runComprehensiveTest() {
  console.log('🔍 Comprehensive Function Test Report')
  console.log('=' .repeat(60))
  console.log(`Testing ${allFunctions.length} functions...\n`)
  
  const results = {
    success: [],
    auth_error: [],
    client_error: [],
    server_error: [],
    function_error: [],
    network_error: []
  }
  
  for (const func of allFunctions) {
    const result = await testFunction(func)
    results[result.status].push({
      name: func.name,
      url: func.url,
      code: result.code,
      error: result.error
    })
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY REPORT')
  console.log('='.repeat(60))
  
  console.log(`\n✅ SUCCESS (${results.success.length}):`)
  results.success.forEach(r => console.log(`   - ${r.name} (${r.code})`))
  
  console.log(`\n🔒 AUTH ERRORS (${results.auth_error.length}) - Expected:`)
  results.auth_error.forEach(r => console.log(`   - ${r.name} (${r.code})`))
  
  console.log(`\n⚠️  CLIENT ERRORS (${results.client_error.length}):`)
  results.client_error.forEach(r => console.log(`   - ${r.name} (${r.code})`))
  
  console.log(`\n❌ SERVER ERRORS (${results.server_error.length}) - NEED FIXING:`)
  results.server_error.forEach(r => {
    console.log(`   - ${r.name} (${r.code})`)
    console.log(`     URL: ${r.url}`)
    if (r.error) console.log(`     Error: ${r.error.substring(0, 100)}...`)
  })
  
  console.log(`\n❌ FUNCTION ERRORS (${results.function_error.length}) - NEED FIXING:`)
  results.function_error.forEach(r => {
    console.log(`   - ${r.name} (${r.code})`)
    console.log(`     URL: ${r.url}`)
    if (r.error) console.log(`     Error: ${r.error.substring(0, 100)}...`)
  })
  
  console.log(`\n❌ NETWORK ERRORS (${results.network_error.length}):`)
  results.network_error.forEach(r => {
    console.log(`   - ${r.name}`)
    console.log(`     Error: ${r.error}`)
  })
  
  const totalErrors = results.server_error.length + results.function_error.length + results.network_error.length
  const totalWorking = results.success.length + results.auth_error.length + results.client_error.length
  
  console.log('\n' + '='.repeat(60))
  console.log('🎯 FINAL SCORE')
  console.log('='.repeat(60))
  console.log(`Working Functions: ${totalWorking}/${allFunctions.length}`)
  console.log(`Critical Errors: ${totalErrors}`)
  console.log(`Health Status: ${totalErrors === 0 ? '🟢 HEALTHY' : totalErrors < 5 ? '🟡 NEEDS ATTENTION' : '🔴 CRITICAL'}`)
  
  return results
}

runComprehensiveTest().catch(console.error)