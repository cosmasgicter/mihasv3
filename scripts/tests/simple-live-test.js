#!/usr/bin/env node

/**
 * MIHAS Simple Live Test - Tests core functions with live credentials
 */

import { execSync } from 'child_process';
import fs from 'fs';

const CONFIG = {
  baseUrl: 'https://mihasv3.pages.dev',
  adminEmail: 'cosmas@beanola.com',
  adminPassword: 'Beanola2025',
  studentEmail: 'cosmaskanchepa8@gmail.com'
};

console.log('🚀 MIHAS Simple Live Function Test');
console.log('==================================');
console.log(`🌐 Testing: ${CONFIG.baseUrl}`);
console.log(`👤 Admin: ${CONFIG.adminEmail}`);
console.log(`📅 Started: ${new Date().toISOString()}\n`);

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

function testEndpoint(path, method = 'GET', description = '') {
  console.log(`🧪 Testing: ${method} ${path} - ${description}`);
  results.total++;
  
  try {
    const url = `${CONFIG.baseUrl}${path}`;
    const cmd = `curl -s -w "HTTPSTATUS:%{http_code}" -X ${method} "${url}"`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
    
    const statusMatch = output.match(/HTTPSTATUS:(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 0;
    const body = output.replace(/HTTPSTATUS:\d+$/, '');
    
    const success = status >= 200 && status < 400;
    
    results.tests.push({
      path,
      method,
      description,
      status,
      success,
      bodyLength: body.length
    });
    
    if (success) {
      results.passed++;
      console.log(`   ✅ PASSED (${status}) - ${body.length} bytes`);
    } else {
      results.failed++;
      console.log(`   ❌ FAILED (${status})`);
      if (body && body.length < 200) {
        console.log(`   Response: ${body.substring(0, 100)}...`);
      }
    }
    
  } catch (error) {
    results.failed++;
    results.tests.push({
      path,
      method,
      description,
      error: error.message,
      success: false
    });
    console.log(`   💥 ERROR: ${error.message}`);
  }
  
  console.log('');
}

// Test core functions
console.log('📋 Testing Core System Functions:');
console.log('---------------------------------');

testEndpoint('/health', 'GET', 'System health check');
testEndpoint('/test', 'GET', 'Basic test endpoint');
testEndpoint('/test-live', 'GET', 'Live test endpoint');

console.log('📋 Testing Public Catalog Functions:');
console.log('------------------------------------');

testEndpoint('/catalog/programs', 'GET', 'Program catalog');
testEndpoint('/catalog/intakes', 'GET', 'Intake periods');
testEndpoint('/catalog/subjects', 'GET', 'Subject catalog');

console.log('📋 Testing Authentication Functions:');
console.log('------------------------------------');

// Test auth endpoints (these might fail without proper payload)
testEndpoint('/auth/signin', 'POST', 'User signin');
testEndpoint('/auth/signup', 'POST', 'User signup');
testEndpoint('/auth/login', 'POST', 'User login');

console.log('📋 Testing Application Functions:');
console.log('---------------------------------');

testEndpoint('/applications', 'GET', 'Application list');
testEndpoint('/applications/details', 'GET', 'Application details');
testEndpoint('/applications/summary', 'GET', 'Application summary');

console.log('📋 Testing Admin Functions:');
console.log('---------------------------');

testEndpoint('/admin/dashboard', 'GET', 'Admin dashboard');
testEndpoint('/admin/users', 'GET', 'User management');

console.log('📋 Testing Notification Functions:');
console.log('----------------------------------');

testEndpoint('/notifications', 'GET', 'Notifications');
testEndpoint('/send-email', 'POST', 'Email service');

console.log('📋 Testing Document Functions:');
console.log('------------------------------');

testEndpoint('/documents/upload', 'POST', 'Document upload');
testEndpoint('/generate/pdf', 'POST', 'PDF generation');

console.log('📋 Testing Analytics Functions:');
console.log('-------------------------------');

testEndpoint('/analytics/metrics', 'GET', 'Analytics metrics');
testEndpoint('/analytics/telemetry', 'GET', 'System telemetry');

// Generate final report
console.log('📊 FINAL RESULTS:');
console.log('=================');
console.log(`⏱️  Test Duration: ${new Date().toISOString()}`);
console.log(`📈 Total Tests: ${results.total}`);
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`📊 Success Rate: ${Math.round((results.passed / results.total) * 100)}%`);

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
const resultsPath = '/home/cosmas/Documents/Visual Code/mihasv3/archive/test-results/simple-live-test-results.json';
try {
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);
} catch (error) {
  console.log(`\n⚠️ Could not save results: ${error.message}`);
}

// Recommendations
console.log('\n🔧 RECOMMENDATIONS:');
if (results.failed === 0) {
  console.log('✅ All tests passed! System is functioning correctly.');
  console.log('🚀 Ready for production deployment.');
} else if (results.failed < results.total * 0.2) {
  console.log('⚠️ Most tests passed with some minor issues.');
  console.log('🔍 Review failed tests and fix before deployment.');
} else {
  console.log('❌ Significant issues detected.');
  console.log('🛠️ Fix critical issues before deployment.');
}

console.log('\n📋 NEXT STEPS:');
console.log('1. Review failed tests');
console.log('2. Fix identified issues');
console.log('3. Commit and push changes to deploy');
console.log('4. Re-run tests to verify fixes');

// Exit with appropriate code
process.exit(results.failed > 0 ? 1 : 0);