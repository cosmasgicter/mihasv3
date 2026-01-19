// Student credential testing
const baseUrl = 'https://mihasv3.pages.dev'

const studentCredentials = { 
  email: 'alexisstar8@gmail.com', 
  password: '***REMOVED***' 
}

let studentToken = null

async function authenticateStudent() {
  console.log('🔐 Authenticating student...')
  
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studentCredentials)
    })

    const data = await response.json()
    
    if (response.ok && data.token) {
      studentToken = data.token
      console.log('✅ Student authenticated successfully')
      console.log(`   User: ${data.user?.email || 'Unknown'}`)
      console.log(`   Token: ${studentToken.substring(0, 20)}...`)
      return true
    } else {
      console.log('❌ Student auth failed:', data.error || 'Unknown error')
      return false
    }
  } catch (error) {
    console.log('❌ Student auth error:', error.message)
    return false
  }
}

const testEndpoints = [
  // Public endpoints (no auth needed)
  { name: 'Health Check', url: `${baseUrl}/api/health`, method: 'GET', type: 'public' },
  { name: 'Programs', url: `${baseUrl}/api/catalog/programs`, method: 'GET', type: 'public' },
  { name: 'Intakes', url: `${baseUrl}/api/catalog/intakes`, method: 'GET', type: 'public' },
  { name: 'Subjects', url: `${baseUrl}/api/catalog/subjects`, method: 'GET', type: 'public' },

  // Student authenticated endpoints
  { name: 'Applications List', url: `${baseUrl}/api/applications`, method: 'GET', type: 'student' },
  { name: 'Document Upload', url: `${baseUrl}/api/documents/upload`, method: 'POST', type: 'student',
    body: { file: 'test-document-data', type: 'result_slip' } },
  { name: 'Generate Slip', url: `${baseUrl}/api/applications/generate-slip`, method: 'POST', type: 'student',
    body: { applicationId: 'test-application-id' } },
  { name: 'Email Slip', url: `${baseUrl}/api/applications/email-slip`, method: 'POST', type: 'student',
    body: { applicationId: 'test-application-id' } },

  // Admin endpoints (should fail with student token)
  { name: 'Admin Dashboard', url: `${baseUrl}/api/admin/dashboard`, method: 'GET', type: 'admin_test' },
  { name: 'Predictive Dashboard', url: `${baseUrl}/api/analytics/predictive-dashboard`, method: 'GET', type: 'admin_test' },
  { name: 'Admin Users', url: `${baseUrl}/api/admin/users/test-id`, method: 'GET', type: 'admin_test' },

  // Application endpoints (may need admin or specific access)
  { name: 'Application Get', url: `${baseUrl}/api/applications/test-id`, method: 'GET', type: 'student' },
  { name: 'Application Update', url: `${baseUrl}/api/applications/test-id`, method: 'PATCH', type: 'student',
    body: { action: 'update_payment_status', paymentStatus: 'verified' } }
]

async function testEndpoint(endpoint) {
  console.log(`\n🧪 Testing: ${endpoint.name} [${endpoint.type}]`)
  
  try {
    const options = {
      method: endpoint.method,
      headers: { 'Content-Type': 'application/json' }
    }
    
    // Add auth header for non-public endpoints
    if (endpoint.type !== 'public' && studentToken) {
      options.headers['Authorization'] = `Bearer ${studentToken}`
    }
    
    if (endpoint.body) {
      options.body = JSON.stringify(endpoint.body)
    }
    
    const response = await fetch(endpoint.url, options)
    const text = await response.text()
    
    console.log(`   Status: ${response.status} ${response.statusText}`)
    
    if (response.status >= 500) {
      console.log('   ❌ SERVER ERROR')
      console.log(`   Response: ${text.substring(0, 150)}...`)
      return { status: 'server_error', code: response.status }
    } else if (response.status === 403) {
      console.log('   🔒 FORBIDDEN (Expected for admin endpoints)')
      return { status: 'forbidden', code: response.status }
    } else if (response.status === 401) {
      console.log('   🔒 UNAUTHORIZED')
      return { status: 'unauthorized', code: response.status }
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
        const keys = Object.keys(json)
        console.log(`   Data keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`)
        
        // Show specific data for interesting responses
        if (json.applications) {
          console.log(`   Applications count: ${json.applications.length}`)
        }
        if (json.user) {
          console.log(`   User: ${json.user.email || json.user.id}`)
        }
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

async function runStudentTests() {
  console.log('🔍 Student Credential Function Test Report')
  console.log('=' .repeat(60))
  
  // Authenticate student
  const authenticated = await authenticateStudent()
  
  if (!authenticated) {
    console.log('\n❌ Student authentication failed. Cannot proceed with authenticated tests.')
    console.log('Will only test public endpoints...')
  }
  
  console.log(`\n🧪 Testing ${testEndpoints.length} endpoints...\n`)
  
  const results = {
    success: [],
    forbidden: [],
    unauthorized: [],
    client_error: [],
    server_error: [],
    network_error: []
  }
  
  for (const endpoint of testEndpoints) {
    const result = await testEndpoint(endpoint)
    results[result.status].push({
      name: endpoint.name,
      code: result.code,
      type: endpoint.type
    })
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 STUDENT CREDENTIAL TEST SUMMARY')
  console.log('='.repeat(60))
  
  console.log(`\n✅ SUCCESS (${results.success.length}):`)
  results.success.forEach(r => console.log(`   - ${r.name} (${r.code}) [${r.type}]`))
  
  console.log(`\n🔒 FORBIDDEN (${results.forbidden.length}) - Expected for admin endpoints:`)
  results.forbidden.forEach(r => console.log(`   - ${r.name} (${r.code}) [${r.type}]`))
  
  console.log(`\n🔒 UNAUTHORIZED (${results.unauthorized.length}):`)
  results.unauthorized.forEach(r => console.log(`   - ${r.name} (${r.code}) [${r.type}]`))
  
  console.log(`\n⚠️  CLIENT ERRORS (${results.client_error.length}):`)
  results.client_error.forEach(r => console.log(`   - ${r.name} (${r.code}) [${r.type}]`))
  
  console.log(`\n❌ SERVER ERRORS (${results.server_error.length}):`)
  results.server_error.forEach(r => console.log(`   - ${r.name} (${r.code}) [${r.type}]`))
  
  console.log(`\n❌ NETWORK ERRORS (${results.network_error.length}):`)
  results.network_error.forEach(r => console.log(`   - ${r.name} [${r.type}]`))
  
  const totalWorking = results.success.length + results.forbidden.length
  const totalErrors = results.server_error.length + results.network_error.length
  
  console.log('\n' + '='.repeat(60))
  console.log('🎯 STUDENT CREDENTIAL FINAL SCORE')
  console.log('='.repeat(60))
  console.log(`Working Functions: ${totalWorking}/${testEndpoints.length}`)
  console.log(`Critical Errors: ${totalErrors}`)
  console.log(`Authentication: ${authenticated ? '✅ Working' : '❌ Failed'}`)
  console.log(`Health Status: ${totalErrors === 0 ? '🟢 HEALTHY' : totalErrors < 3 ? '🟡 NEEDS ATTENTION' : '🔴 CRITICAL'}`)
  
  return results
}

runStudentTests().catch(console.error)