#!/usr/bin/env node

/**
 * MIHAS Comprehensive Live Function Testing Script
 * Tests all functions in the system using live credentials
 * 
 * Admin: cosmas@beanola.com / Beanola2025
 * Student: cosmaskanchepa8@gmail.com
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
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
    password: 'TestPassword123!' // Will need to be set
  },
  timeout: 30000
};

// Test results storage
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  functions: {},
  startTime: new Date(),
  endTime: null,
  errors: []
};

// Authentication tokens
let adminToken = null;
let studentToken = null;

// Utility functions
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MIHAS-Test-Suite/1.0',
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
        try {
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
              // Not JSON, keep as string
            }
          }
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
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

async function authenticate() {
  console.log('🔐 Authenticating users...');
  
  try {
    // Admin authentication
    const adminAuth = await makeRequest(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.supabaseKey,
        'Authorization': `Bearer ${CONFIG.supabaseKey}`
      },
      body: JSON.stringify({
        email: CONFIG.adminCredentials.email,
        password: CONFIG.adminCredentials.password
      })
    });

    if (adminAuth.json && adminAuth.json.access_token) {
      adminToken = adminAuth.json.access_token;
      console.log('✅ Admin authenticated successfully');
    } else {
      console.log('❌ Admin authentication failed:', adminAuth.body);
    }

    // Student authentication (if password is known)
    try {
      const studentAuth = await makeRequest(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`
        },
        body: JSON.stringify({
          email: CONFIG.studentCredentials.email,
          password: CONFIG.studentCredentials.password
        })
      });

      if (studentAuth.json && studentAuth.json.access_token) {
        studentToken = studentAuth.json.access_token;
        console.log('✅ Student authenticated successfully');
      } else {
        console.log('⚠️ Student authentication failed - will test public endpoints only');
      }
    } catch (error) {
      console.log('⚠️ Student authentication error - will test public endpoints only');
    }

  } catch (error) {
    console.error('❌ Authentication error:', error.message);
  }
}

// Function definitions for testing
const FUNCTIONS_TO_TEST = [
  // Core functions
  { path: '/health', method: 'GET', auth: 'none', category: 'core' },
  { path: '/test', method: 'GET', auth: 'none', category: 'core' },
  { path: '/test-live', method: 'GET', auth: 'none', category: 'core' },
  
  // Authentication
  { path: '/auth/signin', method: 'POST', auth: 'none', category: 'auth', body: CONFIG.adminCredentials },
  { path: '/auth/signup', method: 'POST', auth: 'none', category: 'auth' },
  { path: '/auth/login', method: 'POST', auth: 'none', category: 'auth', body: CONFIG.adminCredentials },
  { path: '/auth/register', method: 'POST', auth: 'none', category: 'auth' },
  { path: '/auth/reset/password', method: 'POST', auth: 'none', category: 'auth' },
  
  // Applications
  { path: '/applications', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/details', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/summary', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/grades', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/documents', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/review', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/bulk', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/academic/summary', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/batch/slips', method: 'GET', auth: 'admin', category: 'applications' },
  { path: '/applications/email/slip', method: 'POST', auth: 'admin', category: 'applications' },
  { path: '/applications/generate/slip', method: 'POST', auth: 'admin', category: 'applications' },
  { path: '/applications/reminders/send', method: 'POST', auth: 'admin', category: 'applications' },
  
  // Admin functions
  { path: '/admin/dashboard', method: 'GET', auth: 'admin', category: 'admin' },
  { path: '/admin/users', method: 'GET', auth: 'admin', category: 'admin' },
  { path: '/admin/applications/verify/payment', method: 'POST', auth: 'admin', category: 'admin' },
  { path: '/admin/applications/update/status', method: 'POST', auth: 'admin', category: 'admin' },
  { path: '/admin/audit/log', method: 'GET', auth: 'admin', category: 'admin' },
  { path: '/admin/audit/log/stats', method: 'GET', auth: 'admin', category: 'admin' },
  { path: '/admin/audit/log/export', method: 'GET', auth: 'admin', category: 'admin' },
  { path: '/admin/email/queue/status', method: 'GET', auth: 'admin', category: 'admin' },
  { path: '/admin/queue/status', method: 'GET', auth: 'admin', category: 'admin' },
  
  // API endpoints
  { path: '/api/admin-settings', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/auth-roles', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/auth-sync-roles', method: 'POST', auth: 'admin', category: 'api' },
  { path: '/api/notifications', method: 'GET', auth: 'user', category: 'api' },
  { path: '/api/sessions', method: 'GET', auth: 'user', category: 'api' },
  { path: '/api/auth/session', method: 'GET', auth: 'user', category: 'api' },
  { path: '/api/batch/email', method: 'POST', auth: 'admin', category: 'api' },
  { path: '/api/batch/export', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/batch/status', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/monitoring/metrics', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/audit/logs', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/sessions/track', method: 'POST', auth: 'user', category: 'api' },
  { path: '/api/workflows/rules', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/reports/schedule', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/reports/templates', method: 'GET', auth: 'admin', category: 'api' },
  { path: '/api/ai/predict', method: 'POST', auth: 'admin', category: 'api' },
  { path: '/api/ai/trends', method: 'GET', auth: 'admin', category: 'api' },
  
  // Analytics
  { path: '/analytics/metrics', method: 'GET', auth: 'admin', category: 'analytics' },
  { path: '/analytics/telemetry', method: 'GET', auth: 'admin', category: 'analytics' },
  { path: '/analytics/predictive/dashboard', method: 'GET', auth: 'admin', category: 'analytics' },
  
  // Catalog
  { path: '/catalog/programs', method: 'GET', auth: 'none', category: 'catalog' },
  { path: '/catalog/intakes', method: 'GET', auth: 'none', category: 'catalog' },
  { path: '/catalog/subjects', method: 'GET', auth: 'none', category: 'catalog' },
  
  // Documents
  { path: '/documents/upload', method: 'POST', auth: 'user', category: 'documents' },
  { path: '/generate/pdf', method: 'POST', auth: 'user', category: 'documents' },
  
  // Notifications
  { path: '/notifications', method: 'GET', auth: 'user', category: 'notifications' },
  { path: '/notifications/send', method: 'POST', auth: 'admin', category: 'notifications' },
  { path: '/notifications/preferences', method: 'GET', auth: 'user', category: 'notifications' },
  { path: '/notifications/update-consent', method: 'POST', auth: 'user', category: 'notifications' },
  { path: '/notifications/send-multi-channel', method: 'POST', auth: 'admin', category: 'notifications' },
  { path: '/notifications/application/submitted', method: 'POST', auth: 'admin', category: 'notifications' },
  { path: '/notifications/dispatch/channel', method: 'POST', auth: 'admin', category: 'notifications' },
  { path: '/notifications/process/email/queue', method: 'GET', auth: 'admin', category: 'notifications' },
  { path: '/notifications/update/consent', method: 'POST', auth: 'user', category: 'notifications' },
  
  // Interview
  { path: '/interview/schedule', method: 'POST', auth: 'admin', category: 'interview' },
  { path: '/interview/reminders', method: 'POST', auth: 'admin', category: 'interview' },
  
  // Payments
  { path: '/payments/generate-receipt', method: 'POST', auth: 'user', category: 'payments' },
  
  // Push notifications
  { path: '/push/subscriptions', method: 'GET', auth: 'user', category: 'push' },
  { path: '/push/subscriptions/dispatch', method: 'POST', auth: 'admin', category: 'push' },
  
  // Email
  { path: '/send/email', method: 'POST', auth: 'admin', category: 'email' },
  { path: '/send-email', method: 'POST', auth: 'admin', category: 'email' },
  { path: '/test-email', method: 'POST', auth: 'admin', category: 'email' },
  
  // Cron
  { path: '/cron/cleanup-sessions', method: 'POST', auth: 'admin', category: 'cron' },
  
  // Debug
  { path: '/debug/test', method: 'GET', auth: 'admin', category: 'debug' }
];

async function testFunction(func) {
  const functionName = func.path;
  console.log(`\n🧪 Testing: ${functionName} (${func.method})`);
  
  testResults.total++;
  testResults.functions[functionName] = {
    status: 'testing',
    method: func.method,
    auth: func.auth,
    category: func.category,
    startTime: new Date()
  };

  try {
    // Determine authentication
    let headers = {};
    if (func.auth === 'admin' && adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    } else if (func.auth === 'user' && (adminToken || studentToken)) {
      headers['Authorization'] = `Bearer ${adminToken || studentToken}`;
    } else if (func.auth !== 'none' && !adminToken && !studentToken) {
      testResults.functions[functionName].status = 'skipped';
      testResults.functions[functionName].reason = 'No authentication token available';
      testResults.skipped++;
      console.log(`⏭️ Skipped: ${functionName} - No auth token`);
      return;
    }

    // Prepare request
    const url = `${CONFIG.baseUrl}${functionName}`;
    const options = {
      method: func.method,
      headers
    };

    if (func.body) {
      options.body = JSON.stringify(func.body);
    }

    // Make request
    const response = await makeRequest(url, options);
    
    // Analyze response
    const isSuccess = response.status >= 200 && response.status < 400;
    const isNotFound = response.status === 404;
    const isUnauthorized = response.status === 401 || response.status === 403;
    
    testResults.functions[functionName].endTime = new Date();
    testResults.functions[functionName].duration = testResults.functions[functionName].endTime - testResults.functions[functionName].startTime;
    testResults.functions[functionName].status = isSuccess ? 'passed' : 'failed';
    testResults.functions[functionName].httpStatus = response.status;
    testResults.functions[functionName].response = {
      status: response.status,
      headers: response.headers,
      bodyLength: response.body ? response.body.length : 0,
      hasJson: !!response.json
    };

    if (isSuccess) {
      testResults.passed++;
      console.log(`✅ PASSED: ${functionName} (${response.status})`);
    } else if (isNotFound) {
      testResults.functions[functionName].status = 'not_found';
      testResults.failed++;
      console.log(`❌ NOT FOUND: ${functionName} (404)`);
    } else if (isUnauthorized) {
      testResults.functions[functionName].status = 'unauthorized';
      testResults.failed++;
      console.log(`🔒 UNAUTHORIZED: ${functionName} (${response.status})`);
    } else {
      testResults.failed++;
      console.log(`❌ FAILED: ${functionName} (${response.status})`);
      if (response.json && response.json.error) {
        console.log(`   Error: ${response.json.error}`);
        testResults.functions[functionName].error = response.json.error;
      }
    }

    // Log response details for debugging
    if (response.json) {
      testResults.functions[functionName].responseData = response.json;
    }

  } catch (error) {
    testResults.functions[functionName].status = 'error';
    testResults.functions[functionName].error = error.message;
    testResults.functions[functionName].endTime = new Date();
    testResults.failed++;
    console.log(`💥 ERROR: ${functionName} - ${error.message}`);
    testResults.errors.push({
      function: functionName,
      error: error.message,
      timestamp: new Date()
    });
  }
}

async function runTests() {
  console.log('🚀 Starting MIHAS Comprehensive Function Testing');
  console.log(`📊 Total functions to test: ${FUNCTIONS_TO_TEST.length}`);
  console.log(`🌐 Base URL: ${CONFIG.baseUrl}`);
  
  // Authenticate first
  await authenticate();
  
  console.log('\n' + '='.repeat(60));
  console.log('🧪 RUNNING FUNCTION TESTS');
  console.log('='.repeat(60));

  // Test functions by category
  const categories = [...new Set(FUNCTIONS_TO_TEST.map(f => f.category))];
  
  for (const category of categories) {
    console.log(`\n📂 Testing ${category.toUpperCase()} functions:`);
    const categoryFunctions = FUNCTIONS_TO_TEST.filter(f => f.category === category);
    
    for (const func of categoryFunctions) {
      await testFunction(func);
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  testResults.endTime = new Date();
  testResults.duration = testResults.endTime - testResults.startTime;
}

function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`⏱️  Total Duration: ${Math.round(testResults.duration / 1000)}s`);
  console.log(`📈 Total Tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  console.log(`📊 Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`);

  // Category breakdown
  const categories = {};
  Object.values(testResults.functions).forEach(func => {
    if (!categories[func.category]) {
      categories[func.category] = { total: 0, passed: 0, failed: 0, skipped: 0 };
    }
    categories[func.category].total++;
    if (func.status === 'passed') categories[func.category].passed++;
    else if (func.status === 'skipped') categories[func.category].skipped++;
    else categories[func.category].failed++;
  });

  console.log('\n📂 Results by Category:');
  Object.entries(categories).forEach(([category, stats]) => {
    const successRate = Math.round((stats.passed / stats.total) * 100);
    console.log(`   ${category}: ${stats.passed}/${stats.total} (${successRate}%)`);
  });

  // Failed functions
  const failedFunctions = Object.entries(testResults.functions)
    .filter(([_, func]) => func.status === 'failed' || func.status === 'error' || func.status === 'not_found')
    .map(([name, func]) => ({ name, ...func }));

  if (failedFunctions.length > 0) {
    console.log('\n❌ Failed Functions:');
    failedFunctions.forEach(func => {
      console.log(`   ${func.name} (${func.status}): ${func.error || func.httpStatus || 'Unknown error'}`);
    });
  }

  // Save detailed report
  const reportPath = path.join(__dirname, '../../archive/test-results/comprehensive-live-test-results.json');
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);

  // Generate recommendations
  console.log('\n🔧 RECOMMENDATIONS:');
  
  if (testResults.failed > 0) {
    console.log('1. Review failed functions and fix implementation issues');
    console.log('2. Check authentication and authorization logic');
    console.log('3. Verify function routing and middleware');
  }
  
  if (testResults.skipped > 0) {
    console.log('4. Set up proper authentication for skipped functions');
  }
  
  console.log('5. Deploy fixes and re-run tests');
  console.log('6. Monitor function performance and error rates');
}

// Main execution
async function main() {
  try {
    await runTests();
    generateReport();
    
    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n⚠️ Test interrupted by user');
  testResults.endTime = new Date();
  generateReport();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  testResults.errors.push({
    type: 'unhandledRejection',
    reason: reason.toString(),
    timestamp: new Date()
  });
});

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, testResults, CONFIG };