// Real credential testing with actual authentication
const baseUrl = 'https://mihasv3.pages.dev'

const credentials = {
  student: { email: 'alexisstar8@gmail.com', password: '***REMOVED***' },
  admin: { email: 'cosmas@beanola.com', password: 'Beanola@2025' }
}

let tokens = { student: null, admin: null }

async function authenticate(type) {
  console.log(`🔐 Authenticating ${type}...`)
  
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials[type])
    })

    const data = await response.json()
    
    if (response.ok && data.token) {
      tokens[type] = data.token
      console.log(`✅ ${type} authenticated`)
      return true
    } else {
      console.log(`❌ ${type} auth failed:`, data.error || 'Unknown error')
      return false
    }
  } catch (error) {
    console.log(`❌ ${type} auth error:`, error.message)
    return false
  }
}

const testFunctions = [
  // Public endpoints
  { name: 'Health Check', url: `${baseUrl}/api/health`, method: 'GET' },
  { name: 'Programs', url: `${baseUrl}/api/catalog/programs`, method: 'GET' },
  { name: 'Intakes', url: `${baseUrl}/api/catalog/intakes`, method: 'GET' },
  { name: 'Subjects', url: `${baseUrl}/api/catalog/subjects`, method: 'GET' },

  // Student endpoints
  { name: 'Applications List', url: `${baseUrl}/api/applications`, method: 'GET', auth: 'student' },
  { name: 'Document Upload', url: `${baseUrl}/api/documents/upload`, method: 'POST', auth: 'student',
    body: { file: 'test-data', type: 'result_slip' } },
  { name: 'Generate Slip', url: `${baseUrl}/api/applications/generate-slip`, method: 'POST', auth: 'student',
    body: { applicationId: 'test-id' } },

  // Admin endpoints
  { name: 'Admin Dashboard', url: `${baseUrl}/api/admin/dashboard`, method: 'GET', auth: 'admin' },
  { name: 'Predictive Dashboard', url: `${baseUrl}/api/analytics/predictive-dashboard`, method: 'GET', auth: 'admin' },
  { name: 'Admin Users', url: `${baseUrl}/api/admin/users/test-id`, method: 'GET', auth: 'admin' },
  { name: 'Admin Queue Status', url: `${baseUrl}/api/admin/queue-status`, method: 'GET', auth: 'admin' },
  { name: 'Admin Audit Log Stats', url: `${baseUrl}/api/admin/audit-log/stats`, method: 'GET', auth: 'admin' },
  { name: 'Admin Audit Log Export', url: `${baseUrl}/api/admin/audit-log/export`, method: 'GET', auth: 'admin' },
  { name: 'Process Email Queue', url: `${baseUrl}/api/notifications/process-email-queue`, method: 'POST', auth: 'admin' },
  { name: 'Send Notification', url: `${baseUrl}/api/notifications/send`, method: 'POST', auth: 'admin',
    body: { title: 'Test', message: 'Test message', userId: 'test-id' } },

  // Application management (admin)
  { name: 'Application Get', url: `${baseUrl}/api/applications/87030776-bda9-4373-baa3-77f3fb012ac9`, method: 'GET', auth: 'admin' },
  { name: 'Application Update Payment', url: `${baseUrl}/api/applications/87030776-bda9-4373-baa3-77f3fb012ac9`, method: 'PATCH', auth: 'admin',
    body: { action: 'update_payment_status', paymentStatus: 'verified' } }
]

async function testFunction(func) {
  console.log(`\n🧪 Testing: ${func.name}`)
  
  try {
    const options = {
      method: func.method,
      headers: { 'Content-Type': 'application/json' }
    }
    
    if (func.auth && tokens[func.auth]) {
      options.headers['Authorization'] = `Bearer ${tokens[func.auth]}`
    }
    
    if (func.body) {
      options.body = JSON.stringify(func.body)
    }
    
    const response = await fetch(func.url, options)
    const text = await response.text()
    
    console.log(`   Status: ${response.status} ${response.statusText}`)
    
    if (response.status >= 500) {
      console.log('   ❌ SERVER ERROR')
      console.log(`   Response: ${text.substring(0, 200)}...`)
      return { status: 'server_error', code: response.status }
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

async function runRealCredentialTests() {
  console.log('🔍 Real Credential Function Test Report')
  console.log('=' .repeat(60))
  
  // Authenticate users
  const studentAuth = await authenticate('student')
  const adminAuth = await authenticate('admin')
  
  if (!studentAuth || !adminAuth) {
    console.log('\n❌ Authentication failed. Cannot proceed with tests.')
    return
  }
  
  console.log(`\n🧪 Testing ${testFunctions.length} functions with real credentials...\n`)
  
  const results = {
    success: [],
    client_error: [],
    server_error: [],
    network_error: []
  }
  
  for (const func of testFunctions) {
    const result = await testFunction(func)
    results[result.status].push({
      name: func.name,
      code: result.code,
      auth: func.auth || 'public'
    })
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 REAL CREDENTIAL TEST SUMMARY')
  console.log('='.repeat(60))
  
  console.log(`\n✅ SUCCESS (${results.success.length}):`)
  results.success.forEach(r => console.log(`   - ${r.name} (${r.code}) [${r.auth}]`))
  
  console.log(`\n⚠️  CLIENT ERRORS (${results.client_error.length}):`)
  results.client_error.forEach(r => console.log(`   - ${r.name} (${r.code}) [${r.auth}]`))
  
  console.log(`\n❌ SERVER ERRORS (${results.server_error.length}):`)
  results.server_error.forEach(r => console.log(`   - ${r.name} (${r.code}) [${r.auth}]`))
  
  console.log(`\n❌ NETWORK ERRORS (${results.network_error.length}):`)
  results.network_error.forEach(r => console.log(`   - ${r.name} [${r.auth}]`))
  
  const totalWorking = results.success.length
  const totalErrors = results.server_error.length + results.network_error.length
  
  console.log('\n' + '='.repeat(60))
  console.log('🎯 REAL CREDENTIAL FINAL SCORE')
  console.log('='.repeat(60))
  console.log(`Working Functions: ${totalWorking}/${testFunctions.length}`)
  console.log(`Critical Errors: ${totalErrors}`)
  console.log(`Health Status: ${totalErrors === 0 ? '🟢 HEALTHY' : totalErrors < 3 ? '🟡 NEEDS ATTENTION' : '🔴 CRITICAL'}`)
  
  return results
}

runRealCredentialTests().catch(console.error)