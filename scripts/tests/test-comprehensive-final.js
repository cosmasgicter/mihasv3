#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';

const BASE_URL = '***REMOVED***';
const TEST_EMAIL = 'alexisstar8@gmail.com';
const TEST_PASSWORD = 'Skyl3rL0m1s';

const results = { timestamp: new Date().toISOString(), tests: [], summary: { total: 0, passed: 0, failed: 0 } };

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}/.netlify/functions/${endpoint}`;
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

function logTest(name, result, details = {}) {
  const status = result.ok ? 'PASS' : 'FAIL';
  results.tests.push({ name, status, code: result.status, ...details });
  results.summary.total++;
  if (result.ok) results.summary.passed++;
  else results.summary.failed++;
  console.log(`${result.ok ? '✅' : '❌'} ${name}: ${result.status}`);
}

async function runComprehensiveTest() {
  console.log('🚀 MIHAS Comprehensive API Test\n');

  // 1. Health Check
  logTest('Health Check', await makeRequest('health'));

  // 2. Authentication
  const loginRes = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });
  logTest('Auth Login', loginRes);
  
  const authToken = loginRes.data?.session?.access_token;
  const authHeaders = { 'Authorization': `Bearer ${authToken}` };

  logTest('Auth Register', await makeRequest('auth-register', {
    method: 'POST',
    body: JSON.stringify({ email: `test${Date.now()}@test.com`, password: 'test123', fullName: 'Test User' })
  }));

  logTest('Auth Reset Password', await makeRequest('auth-reset-password', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL })
  }));

  // 3. Catalog APIs
  const programsRes = await makeRequest('catalog-programs');
  logTest('Catalog Programs', programsRes);
  
  const intakesRes = await makeRequest('catalog-intakes');
  logTest('Catalog Intakes', intakesRes);
  
  logTest('Catalog Subjects', await makeRequest('catalog-subjects'));

  // 4. Application CRUD
  const appData = {
    application_number: `MIHAS${Date.now()}`,
    full_name: 'Comprehensive Test User',
    email: TEST_EMAIL,
    phone: '+260977123456',
    date_of_birth: '1995-06-15',
    sex: 'Male',
    nrc_number: 'NRC123456789',
    residence_town: 'Lusaka',
    address_line_1: '123 Test Street',
    address_line_2: 'Test Area',
    postal_code: '10101',
    program: programsRes.data?.programs?.[0]?.name || 'Test Program',
    intake: intakesRes.data?.intakes?.[0]?.name || 'Test Intake',
    institution: 'MIHAS',
    additional_subjects: [{ subject: 'Biology', grade: 2 }],
    status: 'draft'
  };

  const createRes = await makeRequest('applications', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(appData)
  });
  logTest('Application Create', createRes);

  let appId = createRes.data?.id;
  if (appId) {
    logTest('Application Get', await makeRequest(`applications-id?id=${appId}`, { headers: authHeaders }));

    const updateRes = await makeRequest('applications', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        id: appId,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        phone: '+260977654321'
      })
    });
    logTest('Application Update', updateRes);

    logTest('Applications List', await makeRequest('applications?mine=true', { headers: authHeaders }));
  }

  // 5. Document Upload
  const docRes = await makeRequest('documents-upload', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fileName: 'test-document.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      documentType: 'academic_transcript',
      applicationId: appId
    })
  });
  logTest('Document Upload', docRes);

  // 6. Notifications
  const notifRes = await makeRequest('notifications-application-submitted', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      applicationId: appId,
      userEmail: TEST_EMAIL,
      applicationNumber: appData.application_number
    })
  });
  logTest('Notifications', notifRes);

  // 7. Admin APIs (expected to work with proper permissions)
  logTest('Admin Dashboard', await makeRequest('admin-dashboard', { headers: authHeaders }));

  // 8. Analytics
  logTest('Analytics Telemetry', await makeRequest('analytics-telemetry', { headers: authHeaders }));

  // Summary
  const successRate = Math.round((results.summary.passed / results.summary.total) * 100);
  console.log(`\n📊 COMPREHENSIVE TEST RESULTS`);
  console.log(`✅ Passed: ${results.summary.passed}`);
  console.log(`❌ Failed: ${results.summary.failed}`);
  console.log(`📊 Total: ${results.summary.total}`);
  console.log(`🎯 Success Rate: ${successRate}%`);

  // Save results
  fs.writeFileSync('comprehensive-test-results.json', JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: comprehensive-test-results.json`);

  if (appId) {
    console.log(`\n🎉 Application Created: ${appId}`);
    console.log(`📋 Application Number: ${appData.application_number}`);
  }

  console.log(`\n🏆 System Status: ${successRate >= 90 ? 'EXCELLENT' : successRate >= 75 ? 'GOOD' : 'NEEDS ATTENTION'}`);
}

runComprehensiveTest().catch(console.error);