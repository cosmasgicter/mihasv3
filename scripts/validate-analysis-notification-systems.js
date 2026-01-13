#!/usr/bin/env node

/**
 * Comprehensive Validation Script for Analysis and Notification Systems
 * Task 9: Checkpoint - Validate analysis and notification systems
 * 
 * This script validates:
 * 1. Analysis tools produce accurate results
 * 2. Notification system handles all delivery scenarios correctly
 * 3. System behavior meets requirements
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8788';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test results tracking
const testResults = {
  analytics: {
    passed: 0,
    failed: 0,
    tests: []
  },
  notifications: {
    passed: 0,
    failed: 0,
    tests: []
  },
  security: {
    passed: 0,
    failed: 0,
    tests: []
  }
};

/**
 * Utility function to log test results
 */
function logTest(category, testName, passed, details = '') {
  const result = {
    name: testName,
    passed,
    details,
    timestamp: new Date().toISOString()
  };
  
  testResults[category].tests.push(result);
  
  if (passed) {
    testResults[category].passed++;
    console.log(`✅ ${category.toUpperCase()}: ${testName}`);
  } else {
    testResults[category].failed++;
    console.log(`❌ ${category.toUpperCase()}: ${testName} - ${details}`);
  }
  
  if (details) {
    console.log(`   Details: ${details}`);
  }
}

/**
 * Test Analytics System Accuracy
 */
async function testAnalyticsSystem() {
  console.log('\n🔍 Testing Analytics System...');
  
  try {
    // Test 1: Comprehensive Metrics Endpoint
    const metricsResponse = await fetch(`${API_BASE_URL}/analytics/comprehensive-metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        timeRange: {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        },
        includeTimeSeries: true,
        includeProcessingTimes: true
      })
    });
    
    if (metricsResponse.ok) {
      const metricsData = await metricsResponse.json();
      
      // Validate required fields
      const requiredFields = [
        'applicationMetrics',
        'programMetrics', 
        'processingTimeMetrics',
        'conversionMetrics',
        'timeSeriesData'
      ];
      
      const hasAllFields = requiredFields.every(field => 
        metricsData.hasOwnProperty(field)
      );
      
      if (hasAllFields) {
        logTest('analytics', 'Comprehensive Metrics Structure', true, 
          `All required fields present: ${requiredFields.join(', ')}`);
      } else {
        const missingFields = requiredFields.filter(field => 
          !metricsData.hasOwnProperty(field)
        );
        logTest('analytics', 'Comprehensive Metrics Structure', false, 
          `Missing fields: ${missingFields.join(', ')}`);
      }
      
      // Validate data accuracy
      if (metricsData.applicationMetrics) {
        const metrics = metricsData.applicationMetrics;
        const totalCalculated = metrics.completedApplications + metrics.pendingApplications;
        const accuracyCheck = totalCalculated <= metrics.totalApplications;
        
        logTest('analytics', 'Application Metrics Accuracy', accuracyCheck,
          `Total: ${metrics.totalApplications}, Calculated: ${totalCalculated}`);
      }
      
    } else {
      logTest('analytics', 'Comprehensive Metrics Endpoint', false, 
        `HTTP ${metricsResponse.status}: ${await metricsResponse.text()}`);
    }
    
    // Test 2: Real-time Dashboard Data
    const dashboardResponse = await fetch(`${API_BASE_URL}/analytics/dashboard`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    if (dashboardResponse.ok) {
      const dashboardData = await dashboardResponse.json();
      logTest('analytics', 'Real-time Dashboard Endpoint', true, 
        `Dashboard data retrieved successfully`);
      
      // Validate real-time data freshness
      if (dashboardData.generatedAt) {
        const dataAge = Date.now() - new Date(dashboardData.generatedAt).getTime();
        const isFresh = dataAge < 5 * 60 * 1000; // 5 minutes
        
        logTest('analytics', 'Dashboard Data Freshness', isFresh,
          `Data age: ${Math.round(dataAge / 1000)}s`);
      }
    } else {
      logTest('analytics', 'Real-time Dashboard Endpoint', false,
        `HTTP ${dashboardResponse.status}`);
    }
    
    // Test 3: Compliance Checking
    const complianceResponse = await fetch(`${API_BASE_URL}/analytics/compliance/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        checkType: 'data_integrity'
      })
    });
    
    // Note: This endpoint may be incomplete based on the file we saw
    if (complianceResponse.ok) {
      logTest('analytics', 'Compliance Checking Endpoint', true);
    } else {
      logTest('analytics', 'Compliance Checking Endpoint', false,
        `HTTP ${complianceResponse.status} - May need implementation completion`);
    }
    
  } catch (error) {
    logTest('analytics', 'Analytics System Test', false, error.message);
  }
}

/**
 * Test Notification System Reliability
 */
async function testNotificationSystem() {
  console.log('\n📧 Testing Notification System...');
  
  try {
    // Test 1: Multi-channel Notification Delivery
    const testUserId = 'test-user-' + Date.now();
    
    const multiChannelResponse = await fetch(`${API_BASE_URL}/notifications/send-multi-channel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        userId: testUserId,
        title: 'Test Notification',
        message: 'This is a test notification for system validation',
        channels: ['in-app', 'email']
      })
    });
    
    if (multiChannelResponse.ok) {
      const multiChannelData = await multiChannelResponse.json();
      
      if (multiChannelData.success && multiChannelData.results) {
        logTest('notifications', 'Multi-channel Delivery Structure', true,
          `Channels tested: ${Object.keys(multiChannelData.results).join(', ')}`);
        
        // Check if in-app notification was handled
        const hasInApp = multiChannelData.results.inApp;
        logTest('notifications', 'In-app Notification Handling', !!hasInApp,
          hasInApp ? 'In-app notification processed' : 'In-app notification missing');
      } else {
        logTest('notifications', 'Multi-channel Delivery Structure', false,
          'Invalid response structure');
      }
    } else {
      logTest('notifications', 'Multi-channel Delivery Endpoint', false,
        `HTTP ${multiChannelResponse.status}`);
    }
    
    // Test 2: Notification Analytics
    const analyticsResponse = await fetch(`${API_BASE_URL}/notifications/analytics?action=overview&days=7`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    if (analyticsResponse.ok) {
      const analyticsData = await analyticsResponse.json();
      
      if (analyticsData.success && analyticsData.data) {
        logTest('notifications', 'Notification Analytics Structure', true,
          'Analytics data structure is valid');
        
        // Validate analytics data completeness
        const requiredAnalyticsFields = ['summary', 'channel_breakdown'];
        const hasRequiredFields = requiredAnalyticsFields.every(field =>
          analyticsData.data.hasOwnProperty(field)
        );
        
        logTest('notifications', 'Analytics Data Completeness', hasRequiredFields,
          hasRequiredFields ? 'All required fields present' : 'Missing required fields');
      } else {
        logTest('notifications', 'Notification Analytics Structure', false,
          'Invalid analytics response structure');
      }
    } else {
      logTest('notifications', 'Notification Analytics Endpoint', false,
        `HTTP ${analyticsResponse.status}`);
    }
    
    // Test 3: Bulk Notification Management
    const bulkResponse = await fetch(`${API_BASE_URL}/notifications/bulk-manager`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        notifications: [
          {
            userId: 'test-user-1',
            title: 'Bulk Test 1',
            message: 'Test message 1'
          },
          {
            userId: 'test-user-2', 
            title: 'Bulk Test 2',
            message: 'Test message 2'
          }
        ],
        throttleMs: 1000
      })
    });
    
    if (bulkResponse.ok) {
      logTest('notifications', 'Bulk Notification Management', true,
        'Bulk notification endpoint accessible');
    } else {
      logTest('notifications', 'Bulk Notification Management', false,
        `HTTP ${bulkResponse.status}`);
    }
    
    // Test 4: Notification Resilience System
    const resilienceResponse = await fetch(`${API_BASE_URL}/notifications/resilience`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        userId: testUserId,
        title: 'Resilience Test',
        message: 'Testing retry and fallback mechanisms',
        primaryChannel: 'email',
        fallbackChannels: ['sms', 'in-app']
      })
    });
    
    if (resilienceResponse.ok) {
      logTest('notifications', 'Notification Resilience System', true,
        'Resilience system endpoint accessible');
    } else {
      logTest('notifications', 'Notification Resilience System', false,
        `HTTP ${resilienceResponse.status}`);
    }
    
  } catch (error) {
    logTest('notifications', 'Notification System Test', false, error.message);
  }
}

/**
 * Test Security Analysis Tools
 */
async function testSecurityAnalysis() {
  console.log('\n🔒 Testing Security Analysis Tools...');
  
  try {
    // Test 1: Security utilities functionality
    const { validateCsrfToken, generateCsrfToken, sanitizeForLog, isValidOrigin, checkRateLimit } = 
      await import('../functions/_lib/security.js');
    
    // Test CSRF token generation and validation
    const sessionToken = 'test-session-123';
    const csrfToken = generateCsrfToken(sessionToken);
    const isValidCsrf = validateCsrfToken(csrfToken, sessionToken);
    
    logTest('security', 'CSRF Token Generation/Validation', isValidCsrf,
      `Generated token: ${csrfToken?.substring(0, 10)}...`);
    
    // Test input sanitization
    const dangerousInput = '<script>alert("xss")</script>\n\rMalicious\tInput';
    const sanitized = sanitizeForLog(dangerousInput);
    const isSanitized = !sanitized.includes('<script>') && !sanitized.includes('\n');
    
    logTest('security', 'Input Sanitization', isSanitized,
      `Sanitized: ${sanitized.substring(0, 50)}...`);
    
    // Test origin validation
    const validOrigin = 'http://localhost:5173';
    const invalidOrigin = 'https://malicious-site.com';
    
    const validOriginCheck = isValidOrigin(validOrigin);
    const invalidOriginCheck = !isValidOrigin(invalidOrigin);
    
    logTest('security', 'Origin Validation', validOriginCheck && invalidOriginCheck,
      `Valid origin accepted: ${validOriginCheck}, Invalid origin rejected: ${!invalidOriginCheck}`);
    
    // Test rate limiting
    const identifier = 'test-user';
    const firstRequest = checkRateLimit(identifier, 5, 60000);
    const secondRequest = checkRateLimit(identifier, 5, 60000);
    
    logTest('security', 'Rate Limiting Functionality', firstRequest && secondRequest,
      'Rate limiting allows normal requests');
    
    // Test rate limit enforcement
    for (let i = 0; i < 5; i++) {
      checkRateLimit(identifier, 5, 60000);
    }
    const blockedRequest = !checkRateLimit(identifier, 5, 60000);
    
    logTest('security', 'Rate Limit Enforcement', blockedRequest,
      'Rate limiting blocks excessive requests');
    
  } catch (error) {
    logTest('security', 'Security Analysis Tools', false, error.message);
  }
}

/**
 * Test Database Analysis Tools
 */
async function testDatabaseAnalysis() {
  console.log('\n🗄️ Testing Database Analysis Tools...');
  
  try {
    // Test database connectivity and basic queries
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .limit(10);
    
    if (!tablesError && tables) {
      logTest('analytics', 'Database Connectivity', true,
        `Found ${tables.length} tables`);
      
      // Test for key tables existence
      const keyTables = ['applications', 'user_profiles', 'programs', 'subjects'];
      const existingTables = tables.map(t => t.table_name);
      const hasKeyTables = keyTables.every(table => 
        existingTables.includes(table) || existingTables.includes(`${table}s`)
      );
      
      logTest('analytics', 'Key Tables Existence', hasKeyTables,
        `Key tables found: ${keyTables.filter(t => 
          existingTables.includes(t) || existingTables.includes(`${t}s`)
        ).join(', ')}`);
    } else {
      logTest('analytics', 'Database Connectivity', false, 
        tablesError?.message || 'Unable to query database');
    }
    
    // Test application data analysis
    const { data: applications, error: appsError } = await supabase
      .from('applications')
      .select('id, status, created_at, program')
      .limit(100);
    
    if (!appsError && applications) {
      logTest('analytics', 'Application Data Access', true,
        `Retrieved ${applications.length} applications`);
      
      // Analyze data quality
      const statusDistribution = applications.reduce((acc, app) => {
        acc[app.status] = (acc[app.status] || 0) + 1;
        return acc;
      }, {});
      
      const hasValidStatuses = Object.keys(statusDistribution).every(status =>
        ['draft', 'submitted', 'under_review', 'approved', 'rejected'].includes(status)
      );
      
      logTest('analytics', 'Application Status Data Quality', hasValidStatuses,
        `Status distribution: ${JSON.stringify(statusDistribution)}`);
    } else {
      logTest('analytics', 'Application Data Access', false,
        appsError?.message || 'Unable to access application data');
    }
    
  } catch (error) {
    logTest('analytics', 'Database Analysis', false, error.message);
  }
}

/**
 * Generate comprehensive validation report
 */
function generateReport() {
  console.log('\n📊 VALIDATION REPORT');
  console.log('='.repeat(50));
  
  const categories = ['analytics', 'notifications', 'security'];
  let totalPassed = 0;
  let totalFailed = 0;
  
  categories.forEach(category => {
    const results = testResults[category];
    totalPassed += results.passed;
    totalFailed += results.failed;
    
    console.log(`\n${category.toUpperCase()} SYSTEM:`);
    console.log(`  ✅ Passed: ${results.passed}`);
    console.log(`  ❌ Failed: ${results.failed}`);
    console.log(`  📈 Success Rate: ${results.passed + results.failed > 0 ? 
      Math.round((results.passed / (results.passed + results.failed)) * 100) : 0}%`);
  });
  
  console.log('\nOVERALL RESULTS:');
  console.log(`  ✅ Total Passed: ${totalPassed}`);
  console.log(`  ❌ Total Failed: ${totalFailed}`);
  console.log(`  📈 Overall Success Rate: ${totalPassed + totalFailed > 0 ? 
    Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0}%`);
  
  // Detailed failure analysis
  const allFailures = categories.flatMap(category => 
    testResults[category].tests.filter(test => !test.passed)
  );
  
  if (allFailures.length > 0) {
    console.log('\nFAILED TESTS DETAILS:');
    allFailures.forEach(failure => {
      console.log(`  ❌ ${failure.name}: ${failure.details}`);
    });
  }
  
  // Recommendations
  console.log('\nRECOMMENDATIONS:');
  
  if (testResults.analytics.failed > 0) {
    console.log('  📊 Analytics: Review endpoint implementations and data accuracy');
  }
  
  if (testResults.notifications.failed > 0) {
    console.log('  📧 Notifications: Check multi-channel delivery and resilience systems');
  }
  
  if (testResults.security.failed > 0) {
    console.log('  🔒 Security: Verify security utilities and validation functions');
  }
  
  if (totalFailed === 0) {
    console.log('  🎉 All systems are functioning correctly!');
  }
  
  return {
    totalTests: totalPassed + totalFailed,
    passed: totalPassed,
    failed: totalFailed,
    successRate: totalPassed + totalFailed > 0 ? 
      Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0,
    details: testResults
  };
}

/**
 * Main validation function
 */
async function main() {
  console.log('🚀 Starting MIHAS System Analysis & Notification Validation');
  console.log('Task 9: Checkpoint - Validate analysis and notification systems');
  console.log('='.repeat(70));
  
  try {
    // Run all validation tests
    await testAnalyticsSystem();
    await testNotificationSystem();
    await testSecurityAnalysis();
    await testDatabaseAnalysis();
    
    // Generate and display report
    const report = generateReport();
    
    // Save detailed report to file
    const reportData = {
      timestamp: new Date().toISOString(),
      task: 'Task 9: Checkpoint - Validate analysis and notification systems',
      summary: {
        totalTests: report.totalTests,
        passed: report.passed,
        failed: report.failed,
        successRate: report.successRate
      },
      details: report.details,
      environment: {
        supabaseUrl: SUPABASE_URL,
        apiBaseUrl: API_BASE_URL,
        nodeVersion: process.version
      }
    };
    
    // Write report to file
    const fs = await import('fs/promises');
    await fs.writeFile(
      'validation-report-task9.json',
      JSON.stringify(reportData, null, 2)
    );
    
    console.log('\n📄 Detailed report saved to: validation-report-task9.json');
    
    // Exit with appropriate code
    process.exit(report.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n💥 Validation failed with error:', error.message);
    process.exit(1);
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as validateSystems, testResults };