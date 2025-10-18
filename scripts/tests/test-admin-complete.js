// Complete Admin API Test Suite - Production Environment
// Using proper Supabase client for Node.js

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pzlqwhwkgjzjgqjpfzby.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bHF3aHdrZ2p6amdxanBmemJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MzE0NzcsImV4cCI6MjA0ODIwNzQ3N30.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8'

// Admin credentials
const ADMIN_EMAIL = 'alexisstar8@gmail.com'
const ADMIN_PASSWORD = 'Skyl3rL0m1s'

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let testApplicationId = null
const testResults = { passed: 0, failed: 0, tests: [] }

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${status}: ${name}`)
  if (details) console.log(`   ${details}`)
  
  testResults.tests.push({ name, passed, details })
  if (passed) testResults.passed++
  else testResults.failed++
}

// 1. Admin Authentication
async function testAdminAuth() {
  console.log('\n🔐 Testing Admin Authentication...')
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    })
    
    if (error) {
      logTest('Admin Login', false, `Error: ${error.message}`)
      return false
    }
    
    if (data.user && data.session) {
      logTest('Admin Login', true, `User ID: ${data.user.id}`)
      return true
    } else {
      logTest('Admin Login', false, 'No user or session returned')
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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', ADMIN_EMAIL)
      .single()
    
    if (error) {
      logTest('Admin Profile Check', false, `Error: ${error.message}`)
      return false
    }
    
    if (data && data.role === 'admin') {
      logTest('Admin Profile Check', true, `Admin role confirmed for ${data.full_name}`)
      return true
    } else {
      logTest('Admin Profile Check', false, `Role: ${data?.role || 'not found'}`)
      return false
    }
  } catch (error) {
    logTest('Admin Profile Check', false, `Exception: ${error.message}`)
    return false
  }
}

// 3. Get All Applications
async function testGetAllApplications() {
  console.log('\n📋 Testing Get All Applications...')
  
  try {
    const { data, error } = await supabase
      .from('applications_new')
      .select(`
        *,
        profiles(full_name, email),
        programs(name, code),
        intakes(name, year)
      `)
      .order('created_at', { ascending: false })
    
    if (error) {
      logTest('Get All Applications', false, `Error: ${error.message}`)
      return []
    }
    
    logTest('Get All Applications', true, `Retrieved ${data.length} applications`)
    
    // Find a test application
    const pendingApp = data.find(app => app.status === 'pending' || app.status === 'submitted')
    if (pendingApp) {
      testApplicationId = pendingApp.id
      logTest('Found Test Application', true, `Application ID: ${testApplicationId}`)
    }
    
    return data
  } catch (error) {
    logTest('Get All Applications', false, `Exception: ${error.message}`)
    return []
  }
}

// 4. Application Details
async function testGetApplicationDetails() {
  if (!testApplicationId) {
    logTest('Get Application Details', false, 'No test application ID')
    return null
  }
  
  console.log('\n📄 Testing Get Application Details...')
  
  try {
    const { data, error } = await supabase
      .from('applications_new')
      .select(`
        *,
        profiles(full_name, email),
        programs(name, code),
        intakes(name, year)
      `)
      .eq('id', testApplicationId)
      .single()
    
    if (error) {
      logTest('Get Application Details', false, `Error: ${error.message}`)
      return null
    }
    
    logTest('Get Application Details', true, `Retrieved application for ${data.profiles?.full_name}`)
    return data
  } catch (error) {
    logTest('Get Application Details', false, `Exception: ${error.message}`)
    return null
  }
}

// 5. Approval Workflow (Core Test)
async function testApprovalWorkflow() {
  if (!testApplicationId) {
    logTest('Approval Workflow', false, 'No test application ID')
    return false
  }
  
  console.log('\n✅ Testing Approval Workflow...')
  
  try {
    // Store original status
    const { data: originalData } = await supabase
      .from('applications_new')
      .select('status, reviewed_by, reviewed_at, admin_notes')
      .eq('id', testApplicationId)
      .single()
    
    // Test 1: Approve Application
    const { error: approveError } = await supabase
      .from('applications_new')
      .update({
        status: 'approved',
        reviewed_by: ADMIN_EMAIL,
        reviewed_at: new Date().toISOString(),
        admin_notes: 'Application approved via API test'
      })
      .eq('id', testApplicationId)
    
    if (approveError) {
      logTest('Approve Application', false, `Error: ${approveError.message}`)
      return false
    }
    
    logTest('Approve Application', true, 'Status updated to approved')
    
    // Test 2: Verify status change
    const { data: verifyData, error: verifyError } = await supabase
      .from('applications_new')
      .select('status, reviewed_by, reviewed_at, admin_notes')
      .eq('id', testApplicationId)
      .single()
    
    if (verifyError) {
      logTest('Verify Approval Status', false, `Error: ${verifyError.message}`)
      return false
    }
    
    if (verifyData.status === 'approved') {
      logTest('Verify Approval Status', true, 'Status change confirmed')
    } else {
      logTest('Verify Approval Status', false, `Status is ${verifyData.status}, not approved`)
      return false
    }
    
    // Test 3: Reject Application
    const { error: rejectError } = await supabase
      .from('applications_new')
      .update({
        status: 'rejected',
        reviewed_by: ADMIN_EMAIL,
        reviewed_at: new Date().toISOString(),
        admin_notes: 'Application rejected via API test'
      })
      .eq('id', testApplicationId)
    
    if (rejectError) {
      logTest('Reject Application', false, `Error: ${rejectError.message}`)
      return false
    }
    
    logTest('Reject Application', true, 'Status updated to rejected')
    
    // Test 4: Revert to original status
    const { error: revertError } = await supabase
      .from('applications_new')
      .update({
        status: originalData.status,
        reviewed_by: originalData.reviewed_by,
        reviewed_at: originalData.reviewed_at,
        admin_notes: originalData.admin_notes
      })
      .eq('id', testApplicationId)
    
    if (revertError) {
      logTest('Revert Status', false, `Error: ${revertError.message}`)
      return false
    }
    
    logTest('Revert Status', true, 'Application reverted to original status')
    return true
    
  } catch (error) {
    logTest('Approval Workflow', false, `Exception: ${error.message}`)
    return false
  }
}

// 6. Admin Statistics
async function testAdminStatistics() {
  console.log('\n📊 Testing Admin Statistics...')
  
  try {
    const { data, error } = await supabase
      .from('applications_new')
      .select('status')
    
    if (error) {
      logTest('Admin Statistics', false, `Error: ${error.message}`)
      return null
    }
    
    const stats = data.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1
      return acc
    }, {})
    
    logTest('Admin Statistics', true, `Stats: ${JSON.stringify(stats)}`)
    return stats
  } catch (error) {
    logTest('Admin Statistics', false, `Exception: ${error.message}`)
    return null
  }
}

// 7. Programs Management
async function testProgramsManagement() {
  console.log('\n🎓 Testing Programs Management...')
  
  try {
    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .order('name')
    
    if (error) {
      logTest('Get Programs', false, `Error: ${error.message}`)
      return []
    }
    
    logTest('Get Programs', true, `Retrieved ${data.length} programs`)
    
    if (data.length > 0) {
      const program = data[0]
      logTest('Program Details', true, `Program: ${program.name} (${program.code})`)
    }
    
    return data
  } catch (error) {
    logTest('Get Programs', false, `Exception: ${error.message}`)
    return []
  }
}

// 8. Intakes Management
async function testIntakesManagement() {
  console.log('\n📅 Testing Intakes Management...')
  
  try {
    const { data, error } = await supabase
      .from('intakes')
      .select('*')
      .order('year', { ascending: false })
    
    if (error) {
      logTest('Get Intakes', false, `Error: ${error.message}`)
      return []
    }
    
    logTest('Get Intakes', true, `Retrieved ${data.length} intakes`)
    
    if (data.length > 0) {
      const intake = data[0]
      logTest('Intake Details', true, `Intake: ${intake.name} (${intake.year})`)
    }
    
    return data
  } catch (error) {
    logTest('Get Intakes', false, `Exception: ${error.message}`)
    return []
  }
}

// 9. Document Management
async function testDocumentManagement() {
  if (!testApplicationId) {
    logTest('Document Management', false, 'No test application ID')
    return []
  }
  
  console.log('\n📎 Testing Document Management...')
  
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('application_id', testApplicationId)
    
    if (error) {
      logTest('Get Application Documents', false, `Error: ${error.message}`)
      return []
    }
    
    logTest('Get Application Documents', true, `Retrieved ${data.length} documents`)
    
    if (data.length > 0) {
      const doc = data[0]
      logTest('Document Details', true, `Document: ${doc.document_type} - ${doc.file_name}`)
    }
    
    return data
  } catch (error) {
    logTest('Get Application Documents', false, `Exception: ${error.message}`)
    return []
  }
}

// 10. User Management
async function testUserManagement() {
  console.log('\n👥 Testing User Management...')
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (error) {
      logTest('Get Users', false, `Error: ${error.message}`)
      return []
    }
    
    logTest('Get Users', true, `Retrieved ${data.length} user profiles`)
    
    const roleStats = data.reduce((acc, user) => {
      acc[user.role || 'student'] = (acc[user.role || 'student'] || 0) + 1
      return acc
    }, {})
    
    logTest('User Role Distribution', true, `Roles: ${JSON.stringify(roleStats)}`)
    return data
  } catch (error) {
    logTest('Get Users', false, `Exception: ${error.message}`)
    return []
  }
}

// 11. Bulk Operations Test
async function testBulkOperations() {
  console.log('\n📦 Testing Bulk Operations...')
  
  try {
    const { data, error } = await supabase
      .from('applications_new')
      .select('id, status, profiles(full_name)')
      .limit(5)
    
    if (error) {
      logTest('Bulk Operations', false, `Error: ${error.message}`)
      return false
    }
    
    if (data.length > 0) {
      logTest('Bulk Query Operation', true, `Bulk retrieved ${data.length} applications`)
      
      // Test bulk status update simulation (read-only for safety)
      const statusCounts = data.reduce((acc, app) => {
        acc[app.status] = (acc[app.status] || 0) + 1
        return acc
      }, {})
      
      logTest('Bulk Status Analysis', true, `Status distribution: ${JSON.stringify(statusCounts)}`)
      return true
    } else {
      logTest('Bulk Operations', false, 'No applications for bulk test')
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
  await testGetAllApplications()
  await testGetApplicationDetails()
  await testApprovalWorkflow()
  await testAdminStatistics()
  await testProgramsManagement()
  await testIntakesManagement()
  await testDocumentManagement()
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
  
  // Sign out
  await supabase.auth.signOut()
}

// Run the tests
runAdminTests().catch(console.error)