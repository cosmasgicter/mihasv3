#!/usr/bin/env node

/**
 * MIHAS API Testing Script - Fixed Functions
 * Tests all recently fixed API endpoints with real credentials
 * Email: cosmas@beanola.com
 * Password: Beanola2025
 */

const BASE_URL = '***REMOVED***';
const TEST_EMAIL = 'cosmas@beanola.com';
const TEST_PASSWORD = 'Beanola2025';

let authToken = null;
let userId = null;
let applicationId = null;

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Helper function to make API requests
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  if (authToken) {
    defaultHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const config = {
    method: 'GET',
    headers: { ...defaultHeaders, ...options.headers },
    ...options
  };

  try {
    console.log(`🔄 Testing: ${config.method} ${url}`);
    const response = await fetch(url, config);
    const data = await response.text();
    
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch {
      jsonData = data;
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: jsonData,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      data: { error: error.message },
      headers: {}
    };
  }
}

// Test result logging
function logTest(name, passed, details = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name} - ${details}`);
  }
  testResults.details.push({ name, passed, details });
}

// Authentication test
async function testAuth() {
  console.log('\n🔐 Testing Authentication...');
  
  // Test login
  const loginResponse = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    })
  });

  if (loginResponse.ok && loginResponse.data.session?.access_token) {
    authToken = loginResponse.data.session.access_token;
    userId = loginResponse.data.user?.id;
    logTest('Auth Login', true, `Token received: ${authToken.substring(0, 20)}...`);
  } else if (loginResponse.ok && loginResponse.data.access_token) {
    authToken = loginResponse.data.access_token;
    userId = loginResponse.data.user?.id;
    logTest('Auth Login', true, `Token received: ${authToken.substring(0, 20)}...`);
  } else {
    logTest('Auth Login', false, `Status: ${loginResponse.status}, Data: ${JSON.stringify(loginResponse.data)}`);
    return false;
  }

  return true;
}

// Test user profile endpoints
async function testUserProfile() {
  console.log('\n👤 Testing User Profile APIs...');
  
  if (!userId) {
    logTest('User Profile - No User ID', false, 'Cannot test without user ID');
    return;
  }

  // Test GET profile
  const getProfile = await apiRequest(`/api/users/profile/${userId}`);
  logTest('GET User Profile', getProfile.ok, 
    getProfile.ok ? 'Profile retrieved' : `Status: ${getProfile.status}`);

  // Test PUT profile update
  const updateData = {
    first_name: 'Cosmas',
    last_name: 'Test',
    phone: '+260123456789'
  };

  const putProfile = await apiRequest(`/api/users/profile/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(updateData)
  });
  logTest('PUT User Profile', putProfile.ok,
    putProfile.ok ? 'Profile updated' : `Status: ${putProfile.status}`);
}

// Test academic summary
async function testAcademicSummary() {
  console.log('\n📊 Testing Academic Summary...');
  
  const response = await apiRequest('/applications/academic/summary');
  logTest('Academic Summary', response.ok,
    response.ok ? 'Academic data retrieved' : `Status: ${response.status}`);
}

// Test admin endpoints (if user has admin access)
async function testAdminEndpoints() {
  console.log('\n👑 Testing Admin Endpoints...');
  
  // Test batch export
  const batchExport = await apiRequest('/api/batch/export');
  logTest('Batch Export', batchExport.ok || batchExport.status === 403,
    batchExport.status === 403 ? 'Access denied (expected for non-admin)' : 
    batchExport.ok ? 'Export successful' : `Status: ${batchExport.status}`);

  // Test batch status
  const batchStatus = await apiRequest('/api/batch/status');
  logTest('Batch Status', batchStatus.ok || batchStatus.status === 403,
    batchStatus.status === 403 ? 'Access denied (expected for non-admin)' : 
    batchStatus.ok ? 'Status retrieved' : `Status: ${batchStatus.status}`);

  // Test reports schedule
  const reportsSchedule = await apiRequest('/api/reports/schedule');
  logTest('Reports Schedule', reportsSchedule.ok || reportsSchedule.status === 403,
    reportsSchedule.status === 403 ? 'Access denied (expected for non-admin)' : 
    reportsSchedule.ok ? 'Schedule retrieved' : `Status: ${reportsSchedule.status}`);
}

// Test MCP endpoints
async function testMCPEndpoints() {
  console.log('\n🔧 Testing MCP Endpoints...');
  
  // Test schema endpoint
  const schema = await apiRequest('/mcp/schema');
  logTest('MCP Schema', schema.ok,
    schema.ok ? 'Schema retrieved' : `Status: ${schema.status}`);

  // Test query endpoint with simple query
  const query = await apiRequest('/mcp/query', {
    method: 'POST',
    body: JSON.stringify({
      query: 'SELECT COUNT(*) as total FROM applications LIMIT 1'
    })
  });
  logTest('MCP Query', query.ok || query.status === 403,
    query.status === 403 ? 'Access denied (expected for security)' : 
    query.ok ? 'Query executed' : `Status: ${query.status}`);
}

// Test interview scheduling
async function testInterviewScheduling() {
  console.log('\n📅 Testing Interview Scheduling...');
  
  const response = await apiRequest('/interview/schedule');
  logTest('Interview Schedule', response.ok,
    response.ok ? 'Schedule retrieved' : `Status: ${response.status}`);
}

// Test health endpoint
async function testHealthEndpoint() {
  console.log('\n🏥 Testing Health Endpoint...');
  
  const response = await apiRequest('/health');
  logTest('Health Check', response.ok,
    response.ok ? 'System healthy' : `Status: ${response.status}`);
}

// Test registration (create new test user)
async function testRegistration() {
  console.log('\n📝 Testing Registration...');
  
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    first_name: 'Test',
    last_name: 'User'
  };

  const response = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(testUser)
  });
  
  logTest('User Registration', response.ok,
    response.ok ? 'User registered successfully' : `Status: ${response.status}, Error: ${JSON.stringify(response.data)}`);
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting MIHAS API Tests');
  console.log('=' .repeat(50));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Email: ${TEST_EMAIL}`);
  console.log('=' .repeat(50));

  try {
    // Test health first
    await testHealthEndpoint();

    // Test authentication
    const authSuccess = await testAuth();
    if (!authSuccess) {
      console.log('\n❌ Authentication failed. Stopping tests.');
      return;
    }

    // Run all other tests
    await testUserProfile();
    await testAcademicSummary();
    await testAdminEndpoints();
    await testMCPEndpoints();
    await testInterviewScheduling();
    await testRegistration();

  } catch (error) {
    console.error('\n💥 Test execution error:', error);
  }

  // Print summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(50));
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed} ✅`);
  console.log(`Failed: ${testResults.failed} ❌`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.details
      .filter(test => !test.passed)
      .forEach(test => console.log(`  - ${test.name}: ${test.details}`));
  }

  console.log('\n✨ Test execution completed!');
}

// Run the tests
runTests().catch(console.error);