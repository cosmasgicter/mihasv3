#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = '***REMOVED***';
const TEST_EMAIL = 'alexisstar8@gmail.com';
const TEST_PASSWORD = 'Skyl3rL0m1s';

let authToken = null;
let testResults = [];

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

function logResult(name, result) {
  const status = result.ok ? '✅' : '❌';
  console.log(`${status} ${name}: ${result.status}`);
  testResults.push({ name, status: result.ok ? 'PASS' : 'FAIL', code: result.status });
}

async function testAllAPIs() {
  console.log('🚀 Testing All MIHAS APIs\n');

  // Health
  logResult('Health Check', await makeRequest('health'));

  // Auth
  const loginRes = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });
  logResult('Auth Login', loginRes);
  if (loginRes.ok) authToken = loginRes.data.session.access_token;

  logResult('Auth Register', await makeRequest('auth-register', {
    method: 'POST',
    body: JSON.stringify({ email: 'test@test.com', password: 'test123', fullName: 'Test' })
  }));

  logResult('Auth Reset Password', await makeRequest('auth-reset-password', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL })
  }));

  // Catalog
  logResult('Catalog Programs', await makeRequest('catalog-programs'));
  logResult('Catalog Intakes', await makeRequest('catalog-intakes'));
  logResult('Catalog Subjects', await makeRequest('catalog-subjects'));

  // Applications (with auth)
  const authHeaders = { 'Authorization': `Bearer ${authToken}` };
  
  const appRes = await makeRequest('applications', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      application_number: `TEST${Date.now()}`,
      full_name: 'Test User',
      email: TEST_EMAIL,
      phone: '+260977123456',
      date_of_birth: '1995-06-15',
      sex: 'Male',
      nrc_number: 'NRC123456789',
      residence_town: 'Lusaka',
      program: 'Test Program',
      intake: 'Test Intake',
      institution: 'MIHAS',
      status: 'draft'
    })
  });
  logResult('Applications Create', appRes);

  if (appRes.ok) {
    const appId = appRes.data.id;
    logResult('Applications Get', await makeRequest(`applications-id?id=${appId}`, { headers: authHeaders }));
    logResult('Applications Update', await makeRequest('applications', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ id: appId, status: 'submitted' })
    }));
    logResult('Applications List', await makeRequest('applications?mine=true', { headers: authHeaders }));
  }

  // Documents
  logResult('Documents Upload', await makeRequest('documents-upload', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ file: 'test', type: 'transcript' })
  }));

  // Notifications
  logResult('Notifications Send', await makeRequest('notifications-send', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'test', message: 'test' })
  }));

  // Admin (should fail without admin role)
  logResult('Admin Dashboard', await makeRequest('admin-dashboard', { headers: authHeaders }));
  logResult('Admin Users', await makeRequest('admin-users-id', { headers: authHeaders }));

  // Analytics
  logResult('Analytics Telemetry', await makeRequest('analytics-telemetry', { headers: authHeaders }));

  // Summary
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const total = testResults.length;
  console.log(`\n📊 Results: ${passed}/${total} APIs working (${Math.round(passed/total*100)}%)`);
}

testAllAPIs().catch(console.error);