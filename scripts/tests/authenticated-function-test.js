#!/usr/bin/env node

/**
 * MIHAS Authenticated Function Test
 * Tests functions with proper authentication using live credentials
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  baseUrl: 'https://mihasv3.pages.dev',
  supabaseUrl: 'https://mylgegkqoddcrxtwcclb.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw',
  adminCredentials: {
    email: 'cosmas@beanola.com',
    password: 'Beanola2025'
  },
  studentCredentials: {
    email: 'cosmaskanchepa8@gmail.com',
    password: 'TestPassword123!'
  },
  timeout: 15000
};

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
  authentication: {
    admin: null,
    student: null
  }
};

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MIHAS-Auth-Test/1.0',
        ...options.headers
      },
      timeout: CONFIG.timeout
    };

    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = {
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json: null
        };
        
        if (data) {
          try {
            result.json = JSON.parse(data);
          } catch (e) {
            // Not JSON
          }
        }
        
        resolve(result);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function authenticateUser(credentials, userType) {
  console.log(`🔐 Authenticating ${userType}: ${credentials.email}`);
  
  try {
    const response = await makeRequest(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.supabaseKey,
        'Authorization': `Bearer ${CONFIG.supabaseKey}`
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password
      })
    });

    if (response.json && response.json.access_token) {
      console.log(`   ✅ ${userType} authenticated successfully`);
      results.authentication[userType] = {
        success: true,
        token: response.json.access_token,
        user: response.json.user
      };
      return response.json.access_token;
    } else {
      console.log(`   ❌ ${userType} authentication failed`);
      console.log(`   Response: ${response.body.substring(0, 200)}...`);
      results.authentication[userType] = {
        success: false,
        error: response.body
      };
      return null;
    }
  } catch (error) {
    console.log(`   💥 ${userType} authentication error: ${error.message}`);
    results.authentication[userType] = {
      success: false,
      error: error.message
    };
    return null;
  }
}

async function testEndpoint(path, method = 'GET', description = '', authToken = null, expectedStatus = 200) {
  console.log(`🧪 Testing: ${method} ${path} - ${description}`);
  results.total++;
  
  try {
    let headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    let body = null;
    if (method === 'POST' && !path.includes('auth')) {
      body = JSON.stringify({ test: true, timestamp: new Date().toISOString() });
    }
    
    const url = `${CONFIG.baseUrl}${path}`;
    const response = await makeRequest(url, {
      method,
      headers,
      body
    });
    
    const success = response.status >= 200 && response.status < 400;
    
    results.tests.push({
      path,
      method,
      description,
      status: response.status,
      success,
      authenticated: !!authToken,
      bodyLength: response.body ? response.body.length : 0,
      hasJson: !!response.json
    });
    
    if (success) {
      results.passed++;
      console.log(`   ✅ PASSED (${response.status}) - ${response.body ? response.body.length : 0} bytes`);
    } else {
      results.failed++;
      console.log(`   ❌ FAILED (${response.status})`);
      if (response.json && response.json.error) {
        console.log(`   Error: ${response.json.error}`);
      } else if (response.body && response.body.length < 200) {
        console.log(`   Response: ${response.body}`);
      }
    }
    
  } catch (error) {
    results.failed++;
    results.tests.push({
      path,
      method,
      description,
      error: error.message,
      success: false,
      authenticated: !!authToken
    });
    console.log(`   💥 ERROR: ${error.message}`);
  }
  
  console.log('');
}

async function runTests() {
  console.log('🚀 MIHAS Authenticated Function Test');
  console.log('====================================');
  console.log(`🌐 Base URL: ${CONFIG.baseUrl}`);
  console.log(`📅 Started: ${new Date().toISOString()}\n`);
  
  // Step 1: Authenticate users
  console.log('📋 STEP 1: Authentication');
  console.log('-------------------------');
  
  const adminToken = await authenticateUser(CONFIG.adminCredentials, 'admin');
  const studentToken = await authenticateUser(CONFIG.studentCredentials, 'student');
  
  // Step 2: Test public endpoints (no auth required)
  console.log('\n📋 STEP 2: Public Endpoints');
  console.log('---------------------------');
  
  await testEndpoint('/health', 'GET', 'System health check');
  await testEndpoint('/test', 'GET', 'Basic test endpoint');
  await testEndpoint('/catalog/programs', 'GET', 'Program catalog');
  await testEndpoint('/catalog/intakes', 'GET', 'Intake periods');
  await testEndpoint('/catalog/subjects', 'GET', 'Subject catalog');
  
  // Step 3: Test authenticated endpoints with admin token
  if (adminToken) {
    console.log('📋 STEP 3: Admin Authenticated Endpoints');
    console.log('----------------------------------------');
    
    await testEndpoint('/applications', 'GET', 'Application list', adminToken);
    await testEndpoint('/applications/details', 'GET', 'Application details', adminToken);
    await testEndpoint('/applications/summary', 'GET', 'Application summary', adminToken);
    await testEndpoint('/admin/dashboard', 'GET', 'Admin dashboard', adminToken);
    await testEndpoint('/admin/users', 'GET', 'User management', adminToken);
    await testEndpoint('/notifications', 'GET', 'Notifications', adminToken);
    await testEndpoint('/analytics/metrics', 'GET', 'Analytics metrics', adminToken);
  } else {
    console.log('\n⚠️ STEP 3: Skipped - Admin authentication failed');
  }
  
  // Step 4: Test student endpoints
  if (studentToken) {
    console.log('\n📋 STEP 4: Student Authenticated Endpoints');
    console.log('------------------------------------------');
    
    await testEndpoint('/notifications', 'GET', 'Student notifications', studentToken);
    await testEndpoint('/applications/details', 'GET', 'Student application details', studentToken);
  } else {
    console.log('\n⚠️ STEP 4: Skipped - Student authentication failed');
  }
  
  // Step 5: Test POST endpoints with proper payloads
  if (adminToken) {
    console.log('\n📋 STEP 5: POST Endpoints with Admin Auth');
    console.log('-----------------------------------------');
    
    await testEndpoint('/send-email', 'POST', 'Email service', adminToken);
    await testEndpoint('/generate/pdf', 'POST', 'PDF generation', adminToken);
    await testEndpoint('/documents/upload', 'POST', 'Document upload', adminToken);
  }
  
  // Generate final report
  console.log('📊 FINAL RESULTS:');
  console.log('=================');
  console.log(`⏱️  Test Duration: ${new Date().toISOString()}`);
  console.log(`📈 Total Tests: ${results.total}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📊 Success Rate: ${Math.round((results.passed / results.total) * 100)}%`);
  
  // Authentication summary
  console.log(`\n🔐 Authentication Summary:`);
  console.log(`   Admin: ${results.authentication.admin?.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`   Student: ${results.authentication.student?.success ? '✅ Success' : '❌ Failed'}`);
  
  // Show results by category
  const publicTests = results.tests.filter(t => !t.authenticated);
  const authTests = results.tests.filter(t => t.authenticated);
  
  console.log(`\n📊 Results by Category:`);
  console.log(`   Public Endpoints: ${publicTests.filter(t => t.success).length}/${publicTests.length} passed`);
  console.log(`   Authenticated Endpoints: ${authTests.filter(t => t.success).length}/${authTests.length} passed`);
  
  // Show failed tests
  const failedTests = results.tests.filter(t => !t.success);
  if (failedTests.length > 0) {
    console.log(`\n❌ Failed Tests (${failedTests.length}):`);
    failedTests.forEach(test => {
      console.log(`   ${test.method} ${test.path}: ${test.error || test.status}`);
    });
  }
  
  // Show successful tests
  const passedTests = results.tests.filter(t => t.success);
  if (passedTests.length > 0) {
    console.log(`\n✅ Passed Tests (${passedTests.length}):`);
    passedTests.forEach(test => {
      console.log(`   ${test.method} ${test.path}: ${test.status}`);
    });
  }
  
  // Save results
  const resultsPath = path.join(__dirname, '../../archive/test-results/authenticated-test-results.json');
  const reportDir = path.dirname(resultsPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);
  
  // Recommendations
  console.log('\n🔧 RECOMMENDATIONS:');
  if (results.failed === 0) {
    console.log('✅ All tests passed! System is functioning correctly.');
    console.log('🚀 Ready for production use.');
  } else if (!results.authentication.admin?.success) {
    console.log('🔐 Fix admin authentication first - this is blocking most functionality.');
    console.log('📋 Check admin credentials and Supabase auth configuration.');
  } else if (results.failed < results.total * 0.3) {
    console.log('⚠️ Most tests passed with some issues.');
    console.log('🔍 Review failed tests and fix before full deployment.');
  } else {
    console.log('❌ Significant issues detected.');
    console.log('🛠️ Fix critical issues before deployment.');
  }
  
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Fix authentication issues if any');
  console.log('2. Review and fix failed endpoints');
  console.log('3. Commit and push changes');
  console.log('4. Re-run tests to verify fixes');
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
}

export { runTests, results, CONFIG };