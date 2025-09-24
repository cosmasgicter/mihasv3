#!/usr/bin/env node

/**
 * Fixed Live API Testing Script for MIHAS Application System
 * Tests all API endpoints on the live Netlify deployment with correct response handling
 */

import fetch from 'node-fetch';
import fs from 'fs';

// Configuration
const BASE_URL = '***REMOVED***/.netlify/functions';
const STUDENT_CREDENTIALS = {
  email: 'cosmaskanchepa8@gmail.com',
  password: 'Beanola2025'
};
const ADMIN_CREDENTIALS = {
  email: 'cosmas@beanola.com',
  password: 'Beanola2025'
};

// Test results storage
const testResults = {
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  credentials: {
    student: STUDENT_CREDENTIALS.email,
    admin: ADMIN_CREDENTIALS.email
  },
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  },
  tests: []
};

// Helper functions
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
};

const makeRequest = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'MIHAS-Live-API-Tester/1.0'
    }
  };
  
  const requestOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  };

  try {
    log(`Making request to: ${endpoint}`, 'info');
    const response = await fetch(url, requestOptions);
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data
    };
  } catch (error) {
    return {
      status: 0,
      statusText: 'Network Error',
      error: error.message,
      data: null
    };
  }
};

const runTest = async (testName, testFunction) => {
  testResults.summary.total++;
  log(`\n🧪 Running test: ${testName}`, 'info');
  
  try {
    const result = await testFunction();
    if (result.success) {
      testResults.summary.passed++;
      log(`✅ ${testName} - PASSED: ${result.message}`, 'success');
    } else {
      testResults.summary.failed++;
      log(`❌ ${testName} - FAILED: ${result.message}`, 'error');
    }
    
    testResults.tests.push({
      name: testName,
      success: result.success,
      message: result.message,
      details: result.details || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    testResults.summary.failed++;
    log(`💥 ${testName} - ERROR: ${error.message}`, 'error');
    testResults.tests.push({
      name: testName,
      success: false,
      message: error.message,
      details: null,
      timestamp: new Date().toISOString()
    });
  }
};

// Authentication helper
let studentToken = null;
let adminToken = null;

const authenticate = async (credentials, userType) => {
  const response = await makeRequest('/auth-login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
  
  if (response.status === 200 && response.data.session?.access_token) {
    const token = response.data.session.access_token;
    if (userType === 'student') {
      studentToken = token;
    } else {
      adminToken = token;
    }
    return { 
      success: true, 
      token: token,
      message: `${userType} authenticated successfully (${response.data.user.email})`
    };
  }
  
  return { 
    success: false, 
    message: `${userType} authentication failed: ${response.data?.message || response.statusText}`,
    details: response.data
  };
};

// Test definitions
const tests = {
  // Health and basic connectivity
  healthCheck: async () => {
    const response = await makeRequest('/health');
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'Health check passed' : `Health check failed: ${response.statusText}`,
      details: response.data
    };
  },

  testEndpoint: async () => {
    const response = await makeRequest('/test');
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'Test endpoint working' : `Test endpoint failed: ${response.statusText}`,
      details: response.data
    };
  },

  // Authentication tests
  studentLogin: async () => {
    const result = await authenticate(STUDENT_CREDENTIALS, 'student');
    return result;
  },

  adminLogin: async () => {
    const result = await authenticate(ADMIN_CREDENTIALS, 'admin');
    return result;
  },

  // Public catalog endpoints (no auth required)
  getPrograms: async () => {
    const response = await makeRequest('/catalog-programs');
    const isSuccess = response.status === 200;
    let count = 0;
    let sample = null;
    
    if (isSuccess && response.data) {
      if (Array.isArray(response.data)) {
        count = response.data.length;
        sample = response.data.slice(0, 2);
      } else if (response.data.programs && Array.isArray(response.data.programs)) {
        count = response.data.programs.length;
        sample = response.data.programs.slice(0, 2);
      }
    }
    
    return {
      success: isSuccess,
      message: isSuccess ? `Found ${count} programs` : `Failed to get programs: ${response.statusText}`,
      details: isSuccess ? { count, sample } : response.data
    };
  },

  getSubjects: async () => {
    const response = await makeRequest('/catalog-subjects');
    const isSuccess = response.status === 200;
    let count = 0;
    let sample = null;
    
    if (isSuccess && response.data) {
      if (Array.isArray(response.data)) {
        count = response.data.length;
        sample = response.data.slice(0, 2);
      } else if (response.data.subjects && Array.isArray(response.data.subjects)) {
        count = response.data.subjects.length;
        sample = response.data.subjects.slice(0, 2);
      }
    }
    
    return {
      success: isSuccess,
      message: isSuccess ? `Found ${count} subjects` : `Failed to get subjects: ${response.statusText}`,
      details: isSuccess ? { count, sample } : response.data
    };
  },

  getIntakes: async () => {
    const response = await makeRequest('/catalog-intakes');
    const isSuccess = response.status === 200;
    let count = 0;
    let sample = null;
    
    if (isSuccess && response.data) {
      if (Array.isArray(response.data)) {
        count = response.data.length;
        sample = response.data.slice(0, 2);
      } else if (response.data.intakes && Array.isArray(response.data.intakes)) {
        count = response.data.intakes.length;
        sample = response.data.intakes.slice(0, 2);
      }
    }
    
    return {
      success: isSuccess,
      message: isSuccess ? `Found ${count} intakes` : `Failed to get intakes: ${response.statusText}`,
      details: isSuccess ? { count, sample } : response.data
    };
  },

  // Student-specific endpoints
  getStudentApplications: async () => {
    if (!studentToken) {
      return { success: false, message: 'Student not authenticated' };
    }
    
    const response = await makeRequest('/applications', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    
    const isSuccess = response.status === 200;
    let count = 0;
    
    if (isSuccess && response.data) {
      if (Array.isArray(response.data)) {
        count = response.data.length;
      } else if (response.data.applications && Array.isArray(response.data.applications)) {
        count = response.data.applications.length;
      }
    }
    
    return {
      success: isSuccess,
      message: isSuccess ? `Student has ${count} applications` : `Failed to get student applications: ${response.statusText}`,
      details: isSuccess ? { count, applications: response.data } : response.data
    };
  },

  getUserConsents: async () => {
    if (!studentToken) {
      return { success: false, message: 'Student not authenticated' };
    }
    
    const response = await makeRequest('/user-consents', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    
    const isSuccess = response.status === 200;
    return {
      success: isSuccess,
      message: isSuccess ? 'User consents retrieved successfully' : `Failed to get consents: ${response.statusText}`,
      details: response.data
    };
  },

  getPushSubscriptions: async () => {
    if (!studentToken) {
      return { success: false, message: 'Student not authenticated' };
    }
    
    const response = await makeRequest('/push-subscriptions', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    
    const isSuccess = response.status === 200;
    return {
      success: isSuccess,
      message: isSuccess ? 'Push subscriptions retrieved successfully' : `Failed to get subscriptions: ${response.statusText}`,
      details: response.data
    };
  },

  // Admin-specific endpoints
  getAdminApplications: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/applications', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    const isSuccess = response.status === 200;
    let count = 0;
    
    if (isSuccess && response.data) {
      if (Array.isArray(response.data)) {
        count = response.data.length;
      } else if (response.data.applications && Array.isArray(response.data.applications)) {
        count = response.data.applications.length;
      }
    }
    
    return {
      success: isSuccess,
      message: isSuccess ? `Admin can see ${count} total applications` : `Failed to get admin applications: ${response.statusText}`,
      details: isSuccess ? { count, sample: response.data } : response.data
    };
  },

  getAdminDashboard: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/admin-dashboard', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    const isSuccess = response.status === 200;
    return {
      success: isSuccess,
      message: isSuccess ? 'Admin dashboard loaded successfully' : `Failed to load dashboard: ${response.statusText}`,
      details: response.data
    };
  },

  getAnalyticsTelemetry: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/analytics-telemetry', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    const isSuccess = response.status === 200;
    return {
      success: isSuccess,
      message: isSuccess ? 'Analytics telemetry retrieved successfully' : `Failed to get telemetry: ${response.statusText}`,
      details: response.data
    };
  },

  getAuditLogStats: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/admin-audit-log-stats', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    const isSuccess = response.status === 200;
    return {
      success: isSuccess,
      message: isSuccess ? 'Audit log stats retrieved successfully' : `Failed to get audit stats: ${response.statusText}`,
      details: response.data
    };
  },

  getPredictiveDashboard: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/analytics-predictive-dashboard', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    const isSuccess = response.status === 200;
    return {
      success: isSuccess,
      message: isSuccess ? 'Predictive dashboard data retrieved successfully' : `Failed to get predictive data: ${response.statusText}`,
      details: response.data
    };
  },

  // Notification endpoints
  testNotifications: async () => {
    if (!studentToken) {
      return { success: false, message: 'Student not authenticated' };
    }
    
    const response = await makeRequest('/notifications-send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        type: 'test',
        message: 'Live API test notification',
        recipient: STUDENT_CREDENTIALS.email
      })
    });
    
    const isSuccess = response.status === 200 || response.status === 201;
    return {
      success: isSuccess,
      message: isSuccess ? 'Test notification sent successfully' : `Failed to send notification: ${response.statusText}`,
      details: response.data
    };
  },

  // MCP Query endpoint
  testMcpQuery: async () => {
    const response = await makeRequest('/mcp-query', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
        context: 'api testing'
      })
    });
    
    const isSuccess = response.status === 200;
    return {
      success: isSuccess,
      message: isSuccess ? 'MCP query endpoint working' : `MCP query failed: ${response.statusText}`,
      details: response.data
    };
  }
};

// Main test runner
const runAllTests = async () => {
  log('🚀 Starting Fixed Live MIHAS API Testing...', 'info');
  log(`🌐 Base URL: ${BASE_URL}`, 'info');
  log(`👤 Student: ${STUDENT_CREDENTIALS.email}`, 'info');
  log(`👨💼 Admin: ${ADMIN_CREDENTIALS.email}`, 'info');
  log('=' * 80, 'info');

  // Test execution order
  const testOrder = [
    // Basic connectivity
    'healthCheck',
    'testEndpoint',
    
    // Authentication
    'studentLogin',
    'adminLogin',
    
    // Public endpoints
    'getPrograms',
    'getSubjects', 
    'getIntakes',
    
    // Student endpoints
    'getStudentApplications',
    'getUserConsents',
    'getPushSubscriptions',
    
    // Admin endpoints
    'getAdminApplications',
    'getAdminDashboard',
    'getAnalyticsTelemetry',
    'getAuditLogStats',
    'getPredictiveDashboard',
    
    // Functional tests
    'testNotifications',
    'testMcpQuery'
  ];

  for (const testName of testOrder) {
    if (tests[testName]) {
      await runTest(testName, tests[testName]);
      // Small delay between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Generate comprehensive report
  log('\n' + '=' * 80, 'info');
  log('📊 COMPREHENSIVE TEST SUMMARY', 'info');
  log('=' * 80, 'info');
  log(`🎯 Total Tests: ${testResults.summary.total}`, 'info');
  log(`✅ Passed: ${testResults.summary.passed}`, 'success');
  log(`❌ Failed: ${testResults.summary.failed}`, 'error');
  log(`📈 Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(2)}%`, 'info');
  
  // Show failed tests
  const failedTests = testResults.tests.filter(test => !test.success);
  if (failedTests.length > 0) {
    log('\n❌ FAILED TESTS:', 'error');
    failedTests.forEach(test => {
      log(`  • ${test.name}: ${test.message}`, 'error');
    });
  }

  // Show successful tests
  const passedTests = testResults.tests.filter(test => test.success);
  if (passedTests.length > 0) {
    log('\n✅ PASSED TESTS:', 'success');
    passedTests.forEach(test => {
      log(`  • ${test.name}: ${test.message}`, 'success');
    });
  }

  // Save detailed results
  const reportPath = './live-api-test-results-fixed.json';
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  log(`\n📄 Detailed results saved to: ${reportPath}`, 'info');

  // Final status
  if (testResults.summary.failed === 0) {
    log('\n🎉 ALL TESTS PASSED! The MIHAS API is fully functional.', 'success');
  } else {
    log(`\n⚠️  ${testResults.summary.failed} test(s) failed. Please check the details above.`, 'warning');
  }

  log('=' * 80, 'info');
  
  // Exit with appropriate code
  process.exit(testResults.summary.failed > 0 ? 1 : 0);
};

// Handle process termination
process.on('SIGINT', () => {
  log('\n⚠️  Test interrupted by user', 'warning');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`💥 Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
  process.exit(1);
});

// Run the tests
runAllTests().catch(error => {
  log(`💥 Fatal error: ${error.message}`, 'error');
  process.exit(1);
});