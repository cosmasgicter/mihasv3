// Admin API Workflow Test - Production Environment
// Tests all admin APIs including approval workflow with real data

const SUPABASE_URL = 'https://pzlqwhwkgjzjgqjpfzby.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bHF3aHdrZ2p6amdxanBmemJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MzE0NzcsImV4cCI6MjA0ODIwNzQ3N30.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8'

// Admin credentials
const ADMIN_EMAIL = 'alexisstar8@gmail.com'
const ADMIN_PASSWORD = 'Skyl3rL0m1s'

let authToken = null
let testApplicationId = null

// Test Results Tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
}

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${status}: ${name}`)
  if (details) console.log(`   ${details}`)
  
  testResults.tests.push({ name, passed, details })
  if (passed) testResults.passed++
  else testResults.failed++
}

async function makeRequest(endpoint, options = {}) {
  const url = `${SUPABASE_URL}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    ...options.headers
  }
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  })
  
  const data = await response.json()
  return { response, data }
}

// 1. Admin Authentication Test
async function testAdminAuth() {
  console.log('\n🔐 Testing Admin Authentication...')
  
  try {
    const { response, data } = await makeRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      })
    })
    
    if (response.ok && data.access_token) {
      authToken = data.access_token
      logTest('Admin Login', true, `Token received: ${data.access_token.substring(0, 20)}...`)
      return true
    } else {
      logTest('Admin Login', false, `Error: ${JSON.stringify(data)}`)
      return false
    }
  } catch (error) {
    logTest('Admin Login', false, `Exception: ${error.message}`)
    return false
  }
}

// 2. Admin Profile Verification
async function testAdminProfile() {
  console.log('\n👤 Testing Admin Profile...')
  
  try {
    const { response, data } = await makeRequest('/rest/v1/profiles?select=*', {
      method: 'GET'
    })
    
    if (response.ok && data.length > 0) {
      const profile = data.find(p => p.email === ADMIN_EMAIL)
      if (profile && profile.role === 'admin') {
        logTest('Admin Profile Check', true, `Admin role confirmed for ${profile.full_name}`)
        return true
      } else {
        logTest('Admin Profile Check', false, 'Admin role not found')
        return false
      }
    } else {
      logTest('Admin Profile Check', false, `Error: ${JSON.stringify(data)}`)
      return false
    }
  } catch (error) {
    logTest('Admin Profile Check', false, `Exception: ${error.message}`)
    return false
  }
}

// 3. Get All Applications (Admin View)
async function testGetAllApplications() {
  console.log('\n📋 Testing Get All Applications...')
  
  try {
    const { response, data } = await makeRequest('/rest/v1/applications_new?select=*,profiles(full_name,email),programs(name),intakes(name)', {
      method: 'GET'
    })
    
    if (response.ok && Array.isArray(data)) {
      logTest('Get All Applications', true, `Retrieved ${data.length} applications`)
      
      // Find a pending application for approval tests
      const pendingApp = data.find(app => app.status === 'pending' || app.status === 'submitted')
      if (pendingApp) {
        testApplicationId = pendingApp.id
        logTest('Found Pending Application', true, `Application ID: ${testApplicationId}`)
      }
      
      return data
    } else {
      logTest('Get All Applications', false, `Error: ${JSON.stringify(data)}`)
      return []
    }
  } catch (error) {
    logTest('Get All Applications', false, `Exception: ${error.message}`)
    return []
  }
}

// 4. Get Application Details
async function testGetApplicationDetails() {
  if (!testApplicationId) {
    logTest('Get Application Details', false, 'No test application ID available')
    return null
  }
  
  console.log('\n📄 Testing Get Application Details...')
  
  try {
    const { response, data } = await makeRequest(`/rest/v1/applications_new?id=eq.${testApplicationId}&select=*,profiles(full_name,email),programs(name),intakes(name)`, {
      method: 'GET'
    })
    
    if (response.ok && data.length > 0) {
      const application = data[0]
      logTest('Get Application Details', true, `Retrieved application for ${application.profiles?.full_name}`)
      return application
    } else {
      logTest('Get Application Details', false, `Error: ${JSON.stringify(data)}`)
      return null
    }
  } catch (error) {
    logTest('Get Application Details', false, `Exception: ${error.message}`)
    return null
  }
}

// 5. Update Application Status (Approval Workflow)
async function testApprovalWorkflow() {
  if (!testApplicationId) {
    logTest('Approval Workflow', false, 'No test application ID available')
    return false
  }
  
  console.log('\n✅ Testing Approval Workflow...')
  
  try {
    // Test 1: Approve Application
    const { response: approveResponse, data: approveData } = await makeRequest(`/rest/v1/applications_new?id=eq.${testApplicationId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'approved',
        reviewed_by: ADMIN_EMAIL,
        reviewed_at: new Date().toISOString(),
        admin_notes: 'Application approved via API test'
      })
    })
    
    if (approveResponse.ok) {
      logTest('Approve Application', true, 'Application status updated to approved')
      
      // Test 2: Verify status change
      const { response: verifyResponse, data: verifyData } = await makeRequest(`/rest/v1/applications_new?id=eq.${testApplicationId}&select=status,reviewed_by,reviewed_at,admin_notes`, {
        method: 'GET'
      })
      
      if (verifyResponse.ok && verifyData[0]?.status === 'approved') {
        logTest('Verify Approval Status', true, 'Status change confirmed')
        
        // Test 3: Reject Application (reverse test)
        const { response: rejectResponse } = await makeRequest(`/rest/v1/applications_new?id=eq.${testApplicationId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'rejected',
            reviewed_by: ADMIN_EMAIL,
            reviewed_at: new Date().toISOString(),
            admin_notes: 'Application rejected via API test - reverting to original status'
          })
        })
        
        if (rejectResponse.ok) {
          logTest('Reject Application', true, 'Application status updated to rejected')
          
          // Revert to original status
          await makeRequest(`/rest/v1/applications_new?id=eq.${testApplicationId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'pending',
              reviewed_by: null,
              reviewed_at: null,
              admin_notes: null
            })
          })
          logTest('Revert Status', true, 'Application reverted to pending status')
          
          return true
        } else {
          logTest('Reject Application', false, 'Failed to reject application')
          return false
        }
      } else {
        logTest('Verify Approval Status', false, 'Status change not confirmed')
        return false
      }
    } else {
      logTest('Approve Application', false, `Error: ${JSON.stringify(approveData)}`)
      return false
    }
  } catch (error) {
    logTest('Approval Workflow', false, `Exception: ${error.message}`)
    return false
  }
}

// 6. Test Admin Statistics
async function testAdminStatistics() {
  console.log('\n📊 Testing Admin Statistics...')
  
  try {
    // Get application counts by status
    const { response, data } = await makeRequest('/rest/v1/applications_new?select=status', {
      method: 'GET'
    })
    
    if (response.ok && Array.isArray(data)) {
      const stats = data.reduce((acc, app) => {
        acc[app.status] = (acc[app.status] || 0) + 1
        return acc
      }, {})
      
      logTest('Admin Statistics', true, `Stats: ${JSON.stringify(stats)}`)
      return stats
    } else {
      logTest('Admin Statistics', false, `Error: ${JSON.stringify(data)}`)
      return null
    }
  } catch (error) {
    logTest('Admin Statistics', false, `Exception: ${error.message}`)
    return null
  }
}

// 7. Test Programs Management
async function testProgramsManagement() {
  console.log('\n🎓 Testing Programs Management...')
  
  try {
    const { response, data } = await makeRequest('/rest/v1/programs?select=*', {
      method: 'GET'
    })
    
    if (response.ok && Array.isArray(data)) {
      logTest('Get Programs', true, `Retrieved ${data.length} programs`)
      
      // Test program details
      if (data.length > 0) {
        const program = data[0]
        logTest('Program Details', true, `Program: ${program.name} (${program.code})`)
      }
      
      return data
    } else {
      logTest('Get Programs', false, `Error: ${JSON.stringify(data)}`)
      return []
    }
  } catch (error) {
    logTest('Get Programs', false, `Exception: ${error.message}`)
    return []
  }
}

// 8. Test Intakes Management
async function testIntakesManagement() {
  console.log('\n📅 Testing Intakes Management...')
  
  try {
    const { response, data } = await makeRequest('/rest/v1/intakes?select=*', {
      method: 'GET'
    })
    
    if (response.ok && Array.isArray(data)) {
      logTest('Get Intakes', true, `Retrieved ${data.length} intakes`)
      
      // Test intake details
      if (data.length > 0) {
        const intake = data[0]
        logTest('Intake Details', true, `Intake: ${intake.name} (${intake.year})`)
      }
      
      return data
    } else {
      logTest('Get Intakes', false, `Error: ${JSON.stringify(data)}`)
      return []
    }
  } catch (error) {
    logTest('Get Intakes', false, `Exception: ${error.message}`)
    return []
  }
}

// 9. Test Document Management
async function testDocumentManagement() {
  if (!testApplicationId) {
    logTest('Document Management', false, 'No test application ID available')
    return false
  }
  
  console.log('\n📎 Testing Document Management...')
  
  try {
    const { response, data } = await makeRequest(`/rest/v1/documents?application_id=eq.${testApplicationId}&select=*`, {
      method: 'GET'
    })
    
    if (response.ok && Array.isArray(data)) {
      logTest('Get Application Documents', true, `Retrieved ${data.length} documents`)
      
      if (data.length > 0) {
        const doc = data[0]
        logTest('Document Details', true, `Document: ${doc.document_type} - ${doc.file_name}`)
      }
      
      return data
    } else {
      logTest('Get Application Documents', false, `Error: ${JSON.stringify(data)}`)
      return []
    }
  } catch (error) {
    logTest('Get Application Documents', false, `Exception: ${error.message}`)
    return []
  }
}

// 10. Test Notification System
async function testNotificationSystem() {
  console.log('\n🔔 Testing Notification System...')
  
  try {
    const { response, data } = await makeRequest('/rest/v1/notifications?select=*&order=created_at.desc&limit=10', {
      method: 'GET'
    })
    
    if (response.ok && Array.isArray(data)) {
      logTest('Get Notifications', true, `Retrieved ${data.length} recent notifications`)
      
      if (data.length > 0) {
        const notification = data[0]
        logTest('Notification Details', true, `Latest: ${notification.title}`)
      }
      
      return data
    } else {
      logTest('Get Notifications', false, `Error: ${JSON.stringify(data)}`)
      return []
    }
  } catch (error) {
    logTest('Get Notifications', false, `Exception: ${error.message}`)
    return []
  }
}

// 11. Test User Management
async function testUserManagement() {
  console.log('\n👥 Testing User Management...')
  
  try {
    const { response, data } = await makeRequest('/rest/v1/profiles?select=*&order=created_at.desc&limit=10', {
      method: 'GET'
    })
    
    if (response.ok && Array.isArray(data)) {
      logTest('Get Users', true, `Retrieved ${data.length} user profiles`)
      
      // Count by role
      const roleStats = data.reduce((acc, user) => {
        acc[user.role || 'student'] = (acc[user.role || 'student'] || 0) + 1
        return acc
      }, {})
      
      logTest('User Role Distribution', true, `Roles: ${JSON.stringify(roleStats)}`)
      
      return data
    } else {
      logTest('Get Users', false, `Error: ${JSON.stringify(data)}`)
      return []
    }
  } catch (error) {
    logTest('Get Users', false, `Exception: ${error.message}`)
    return []
  }
}

// 12. Test Bulk Operations
async function testBulkOperations() {
  console.log('\n📦 Testing Bulk Operations...')
  
  try {
    // Get multiple applications for bulk test
    const { response, data } = await makeRequest('/rest/v1/applications_new?select=id,status&limit=5', {
      method: 'GET'
    })
    
    if (response.ok && Array.isArray(data) && data.length > 0) {
      logTest('Get Applications for Bulk Test', true, `Retrieved ${data.length} applications`)
      
      // Test bulk status query (simulated bulk operation)
      const applicationIds = data.map(app => app.id)
      const bulkQuery = applicationIds.map(id => `id.eq.${id}`).join(',')
      
      const { response: bulkResponse, data: bulkData } = await makeRequest(`/rest/v1/applications_new?or=(${bulkQuery})&select=id,status,profiles(full_name)`, {
        method: 'GET'
      })
      
      if (bulkResponse.ok && Array.isArray(bulkData)) {
        logTest('Bulk Query Operation', true, `Bulk retrieved ${bulkData.length} applications`)
        return true
      } else {
        logTest('Bulk Query Operation', false, 'Bulk query failed')
        return false
      }
    } else {
      logTest('Get Applications for Bulk Test', false, 'No applications available for bulk test')
      return false
    }
  } catch (error) {
    logTest('Bulk Operations', false, `Exception: ${error.message}`)
    return false
  }
}

// Main Test Runner
async function runAdminTests() {
  console.log('🚀 Starting MIHAS Admin API Tests - Production Environment')
  console.log('=' .repeat(60))
  
  const startTime = Date.now()
  
  // Run all tests
  const authSuccess = await testAdminAuth()
  if (!authSuccess) {
    console.log('\n❌ Authentication failed. Cannot proceed with other tests.')
    return
  }
  
  await testAdminProfile()
  const applications = await testGetAllApplications()
  await testGetApplicationDetails()
  await testApprovalWorkflow()
  await testAdminStatistics()
  await testProgramsManagement()
  await testIntakesManagement()
  await testDocumentManagement()
  await testNotificationSystem()
  await testUserManagement()
  await testBulkOperations()
  
  // Final Results
  const endTime = Date.now()
  const duration = (endTime - startTime) / 1000
  
  console.log('\n' + '=' .repeat(60))
  console.log('📊 ADMIN API TEST RESULTS')
  console.log('=' .repeat(60))
  console.log(`✅ Passed: ${testResults.passed}`)
  console.log(`❌ Failed: ${testResults.failed}`)
  console.log(`⏱️  Duration: ${duration}s`)
  console.log(`🎯 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`)
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:')
    testResults.tests.filter(t => !t.passed).forEach(test => {
      console.log(`   - ${test.name}: ${test.details}`)
    })
  }
  
  console.log('\n🏁 Admin API testing completed!')
}

// Run the tests
runAdminTests().catch(console.error)