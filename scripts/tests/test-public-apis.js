#!/usr/bin/env node

/**
 * MIHAS Application System - Public API Test
 * Tests public endpoints that don't require authentication
 */

import fetch from 'node-fetch';
import fs from 'fs';

const BASE_URL = '***REMOVED***';

const testResults = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: { total: 0, passed: 0, failed: 0 }
};

function logTest(name, status, details = {}) {
  const test = { name, status, timestamp: new Date().toISOString(), ...details };
  testResults.tests.push(test);
  testResults.summary.total++;
  
  if (status === 'PASS') {
    testResults.summary.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.summary.failed++;
    console.log(`❌ ${name}`);
    if (details.error) console.log(`   Error: ${details.error}`);
  }
  
  if (details.response) {
    console.log(`   Response: ${JSON.stringify(details.response, null, 2)}`);
  }
}

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}/.netlify/functions/${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    }
  };
  
  const requestOptions = { ...defaultOptions, ...options };
  console.log(`🔄 ${requestOptions.method || 'GET'} ${url}`);
  
  try {
    const response = await fetch(url, requestOptions);
    const data = await response.json();
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      error: error.message,
      data: null
    };
  }
}

async function testHealthCheck() {
  console.log('\n🏥 Testing Health Check...');
  const response = await makeRequest('health');
  
  if (response.ok && response.data?.status) {
    logTest('Health Check', 'PASS', { 
      response: {
        status: response.data.status,
        mode: response.data.mode,
        supabaseStatus: response.data.supabase?.status
      }
    });
    return true;
  } else {
    logTest('Health Check', 'FAIL', { 
      error: `Status: ${response.status}`,
      response: response.data 
    });
    return false;
  }
}

async function testCatalogPrograms() {
  console.log('\n📚 Testing Catalog Programs...');
  const response = await makeRequest('catalog-programs');
  
  if (response.ok && response.data?.programs) {
    logTest('Catalog Programs', 'PASS', { 
      response: { 
        programCount: response.data.programs.length,
        samplePrograms: response.data.programs.slice(0, 2).map(p => ({
          id: p.id,
          name: p.name,
          institution: p.institutions?.name || p.institution
        }))
      }
    });
    return response.data.programs;
  } else {
    logTest('Catalog Programs', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return [];
  }
}

async function testCatalogIntakes() {
  console.log('\n📅 Testing Catalog Intakes...');
  const response = await makeRequest('catalog-intakes');
  
  if (response.ok && response.data?.intakes) {
    logTest('Catalog Intakes', 'PASS', { 
      response: { 
        intakeCount: response.data.intakes.length,
        sampleIntakes: response.data.intakes.slice(0, 2).map(i => ({
          id: i.id,
          name: i.name,
          year: i.year,
          deadline: i.application_deadline
        }))
      }
    });
    return response.data.intakes;
  } else {
    logTest('Catalog Intakes', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return [];
  }
}

async function testCatalogSubjects() {
  console.log('\n📖 Testing Catalog Subjects...');
  const response = await makeRequest('catalog-subjects');
  
  if (response.ok && response.data) {
    logTest('Catalog Subjects', 'PASS', { 
      response: { 
        subjectCount: Array.isArray(response.data.subjects) ? response.data.subjects.length : 'N/A',
        hasSubjects: !!response.data.subjects
      }
    });
    return response.data.subjects || [];
  } else {
    logTest('Catalog Subjects', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return [];
  }
}

async function testRegistrationEndpoint() {
  console.log('\n👤 Testing Registration Endpoint (Structure)...');
  
  // Test with invalid data to see the validation response
  const response = await makeRequest('auth-register', {
    method: 'POST',
    body: JSON.stringify({})
  });
  
  if (response.status === 400 && response.data?.error) {
    logTest('Registration Endpoint Structure', 'PASS', { 
      response: { 
        validationWorking: true,
        errorMessage: response.data.error,
        status: response.status
      }
    });
    return true;
  } else {
    logTest('Registration Endpoint Structure', 'FAIL', { 
      error: `Unexpected response: ${response.status}`,
      response: response.data 
    });
    return false;
  }
}

async function testLoginEndpoint() {
  console.log('\n🔐 Testing Login Endpoint (Structure)...');
  
  // Test with invalid data to see the validation response
  const response = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify({})
  });
  
  if (response.status === 400 && response.data?.error) {
    logTest('Login Endpoint Structure', 'PASS', { 
      response: { 
        validationWorking: true,
        errorMessage: response.data.error,
        status: response.status
      }
    });
    return true;
  } else {
    logTest('Login Endpoint Structure', 'FAIL', { 
      error: `Unexpected response: ${response.status}`,
      response: response.data 
    });
    return false;
  }
}

async function testApplicationsEndpoint() {
  console.log('\n📝 Testing Applications Endpoint (No Auth)...');
  
  // Test without authentication to see the response
  const response = await makeRequest('applications');
  
  if (response.status === 401) {
    logTest('Applications Endpoint Security', 'PASS', { 
      response: { 
        authRequired: true,
        errorMessage: response.data?.error,
        status: response.status
      }
    });
    return true;
  } else {
    logTest('Applications Endpoint Security', 'FAIL', { 
      error: `Expected 401, got ${response.status}`,
      response: response.data 
    });
    return false;
  }
}

async function testDocumentUploadEndpoint() {
  console.log('\n📎 Testing Document Upload Endpoint (No Auth)...');
  
  const response = await makeRequest('documents-upload', {
    method: 'POST',
    body: JSON.stringify({})
  });
  
  if (response.status === 401) {
    logTest('Document Upload Security', 'PASS', { 
      response: { 
        authRequired: true,
        errorMessage: response.data?.error,
        status: response.status
      }
    });
    return true;
  } else {
    logTest('Document Upload Security', 'FAIL', { 
      error: `Expected 401, got ${response.status}`,
      response: response.data 
    });
    return false;
  }
}

async function testNotificationEndpoint() {
  console.log('\n🔔 Testing Notification Endpoint (No Auth)...');
  
  const response = await makeRequest('notifications-send', {
    method: 'POST',
    body: JSON.stringify({})
  });
  
  if (response.status === 401) {
    logTest('Notification Security', 'PASS', { 
      response: { 
        authRequired: true,
        errorMessage: response.data?.error,
        status: response.status
      }
    });
    return true;
  } else {
    logTest('Notification Security', 'FAIL', { 
      error: `Expected 401, got ${response.status}`,
      response: response.data 
    });
    return false;
  }
}

async function testCORSHeaders() {
  console.log('\n🌐 Testing CORS Headers...');
  
  const response = await makeRequest('health', {
    method: 'OPTIONS'
  });
  
  const corsHeaders = {
    'access-control-allow-origin': response.headers['access-control-allow-origin'],
    'access-control-allow-methods': response.headers['access-control-allow-methods'],
    'access-control-allow-headers': response.headers['access-control-allow-headers']
  };
  
  if (corsHeaders['access-control-allow-origin']) {
    logTest('CORS Headers', 'PASS', { 
      response: corsHeaders
    });
    return true;
  } else {
    logTest('CORS Headers', 'FAIL', { 
      error: 'Missing CORS headers',
      response: corsHeaders 
    });
    return false;
  }
}

async function runPublicAPITests() {
  console.log('🚀 Starting MIHAS Public API Tests');
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log('=' .repeat(60));
  
  // Test all public endpoints
  await testHealthCheck();
  await testCatalogPrograms();
  await testCatalogIntakes();
  await testCatalogSubjects();
  await testRegistrationEndpoint();
  await testLoginEndpoint();
  await testApplicationsEndpoint();
  await testDocumentUploadEndpoint();
  await testNotificationEndpoint();
  await testCORSHeaders();
  
  // Generate report
  console.log('\n' + '='.repeat(60));
  console.log('📊 PUBLIC API TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.summary.passed}`);
  console.log(`❌ Failed: ${testResults.summary.failed}`);
  console.log(`📊 Total: ${testResults.summary.total}`);
  console.log(`📈 Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);
  
  // Save results
  const resultsFile = 'public-api-test-results.json';
  fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Results saved to: ${resultsFile}`);
  
  if (testResults.summary.failed > 0) {
    console.log('\n⚠️  Some tests failed. Check the detailed results.');
    process.exit(1);
  } else {
    console.log('\n🎉 All public API tests passed!');
    process.exit(0);
  }
}

runPublicAPITests().catch(error => {
  console.error('\n💥 Test execution failed:', error);
  process.exit(1);
});