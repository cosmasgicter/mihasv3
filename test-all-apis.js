#!/usr/bin/env node

/**
 * Comprehensive API Testing Script for MIHAS Application System
 * Tests all API endpoints with both student and admin credentials
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Configuration
const BASE_URL = 'http://localhost:8888/.netlify/functions';
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

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const makeRequest = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'MIHAS-API-Tester/1.0'
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
  log(`Running test: ${testName}`, 'info');
  
  try {
    const result = await testFunction();
    if (result.success) {
      testResults.summary.passed++;
      log(`✓ ${testName} - PASSED`, 'success');
    } else {
      testResults.summary.failed++;
      log(`✗ ${testName} - FAILED: ${result.message}`, 'error');
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
    log(`✗ ${testName} - ERROR: ${error.message}`, 'error');
    testResults.tests.push({
      name: testName,
      success: false,
      message: error.message,
      details: null,
      timestamp: new Date().toISOString()
    });
  }
};

const warmupServer = async () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await makeRequest('/test')
    if (response.status === 200) {
      log(`Server warmup succeeded on attempt ${attempt}`, 'success')
      return true
    }

    log(`Server warmup attempt ${attempt} failed (${response.statusText || response.error || 'Unknown error'})`, 'warning')
    await wait(500 * attempt)
  }

  log('Proceeding with tests after warmup retries', 'warning')
  return false
}

// Authentication helper
let studentToken = null;
let adminToken = null;

const authenticate = async (credentials, userType) => {
  const response = await makeRequest('/auth-login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
  
  if (response.status === 200 && response.data.token) {
    if (userType === 'student') {
      studentToken = response.data.token;
    } else {
      adminToken = response.data.token;
    }
    return { success: true, token: response.data.token };
  }
  
  return { success: false, message: `Authentication failed: ${response.data?.message || response.statusText}` };
};

// Test definitions
const tests = {
  // Health check
  healthCheck: async () => {
    const response = await makeRequest('/health');
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'Health check passed' : `Health check failed: ${response.statusText}`,
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

  // Catalog endpoints
  getPrograms: async () => {
    const response = await makeRequest('/catalog-programs');
    return {
      success: response.status === 200,
      message: response.status === 200 ? `Found ${response.data?.length || 0} programs` : `Failed to get programs: ${response.statusText}`,
      details: response.data
    };
  },

  getSubjects: async () => {
    const response = await makeRequest('/catalog-subjects');
    return {
      success: response.status === 200,
      message: response.status === 200 ? `Found ${response.data?.length || 0} subjects` : `Failed to get subjects: ${response.statusText}`,
      details: response.data
    };
  },

  getIntakes: async () => {
    const response = await makeRequest('/catalog-intakes');
    return {
      success: response.status === 200,
      message: response.status === 200 ? `Found ${response.data?.length || 0} intakes` : `Failed to get intakes: ${response.statusText}`,
      details: response.data
    };
  },

  // Applications endpoints (student)
  getStudentApplications: async () => {
    if (!studentToken) {
      return { success: false, message: 'Student not authenticated' };
    }
    
    const response = await makeRequest('/applications', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    
    return {
      success: response.status === 200,
      message: response.status === 200 ? `Found ${response.data?.length || 0} student applications` : `Failed to get applications: ${response.statusText}`,
      details: response.data
    };
  },

  // Applications endpoints (admin)
  getAdminApplications: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/applications', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    return {
      success: response.status === 200,
      message: response.status === 200 ? `Admin found ${response.data?.length || 0} applications` : `Failed to get applications: ${response.statusText}`,
      details: response.data
    };
  },

  // Admin dashboard
  getAdminDashboard: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/admin-dashboard', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'Admin dashboard loaded successfully' : `Failed to load dashboard: ${response.statusText}`,
      details: response.data
    };
  },

  // Analytics endpoints
  getAnalyticsTelemetry: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/analytics-telemetry', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'Analytics telemetry retrieved' : `Failed to get telemetry: ${response.statusText}`,
      details: response.data
    };
  },

  // Notifications
  testNotifications: async () => {
    if (!studentToken) {
      return { success: false, message: 'Student not authenticated' };
    }
    
    const response = await makeRequest('/notifications-send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        type: 'test',
        message: 'API test notification',
        recipient: STUDENT_CREDENTIALS.email
      })
    });
    
    return {
      success: response.status === 200 || response.status === 201,
      message: response.status === 200 || response.status === 201 ? 'Notification sent successfully' : `Failed to send notification: ${response.statusText}`,
      details: response.data
    };
  },

  // User consents
  getUserConsents: async () => {
    if (!studentToken) {
      return { success: false, message: 'Student not authenticated' };
    }
    
    const response = await makeRequest('/user-consents', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'User consents retrieved' : `Failed to get consents: ${response.statusText}`,
      details: response.data
    };
  },

  // Push subscriptions
  getPushSubscriptions: async () => {
    if (!studentToken) {
      return { success: false, message: 'Student not authenticated' };
    }
    
    const response = await makeRequest('/push-subscriptions', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'Push subscriptions retrieved' : `Failed to get subscriptions: ${response.statusText}`,
      details: response.data
    };
  },

  // Admin audit logs
  getAuditLogStats: async () => {
    if (!adminToken) {
      return { success: false, message: 'Admin not authenticated' };
    }
    
    const response = await makeRequest('/admin-audit-log-stats', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'Audit log stats retrieved' : `Failed to get audit stats: ${response.statusText}`,
      details: response.data
    };
  },

  // Test endpoint
  testEndpoint: async () => {
    const response = await makeRequest('/test');
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'Test endpoint working' : `Test endpoint failed: ${response.statusText}`,
      details: response.data
    };
  }
};

// Main test runner
const runAllTests = async () => {
  log('Starting comprehensive API testing...', 'info');
  log(`Base URL: ${BASE_URL}`, 'info');
  log(`Student: ${STUDENT_CREDENTIALS.email}`, 'info');
  log(`Admin: ${ADMIN_CREDENTIALS.email}`, 'info');
  log('='.repeat(50), 'info');

  await warmupServer();

  // Run tests in order
  const testOrder = [
    'healthCheck',
    'testEndpoint',
    'studentLogin',
    'adminLogin',
    'getPrograms',
    'getSubjects',
    'getIntakes',
    'getStudentApplications',
    'getAdminApplications',
    'getAdminDashboard',
    'getAnalyticsTelemetry',
    'testNotifications',
    'getUserConsents',
    'getPushSubscriptions',
    'getAuditLogStats'
  ];

  for (const testName of testOrder) {
    if (tests[testName]) {
      await runTest(testName, tests[testName]);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Generate report
  log('='.repeat(50), 'info');
  log('TEST SUMMARY:', 'info');
  log(`Total Tests: ${testResults.summary.total}`, 'info');
  log(`Passed: ${testResults.summary.passed}`, 'success');
  log(`Failed: ${testResults.summary.failed}`, 'error');
  log(`Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(2)}%`, 'info');

  // Save detailed results
  const reportPath = path.join(process.cwd(), 'api-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  log(`Detailed results saved to: ${reportPath}`, 'info');

  // Exit with appropriate code
  process.exit(testResults.summary.failed > 0 ? 1 : 0);
};

// Handle process termination
process.on('SIGINT', () => {
  log('Test interrupted by user', 'warning');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
  process.exit(1);
});

// Run the tests
runAllTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});