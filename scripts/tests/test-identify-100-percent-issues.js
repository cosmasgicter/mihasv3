#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'https://mihasv3.pages.dev';
const TEST_EMAIL = 'alexisstar8@gmail.com';
const TEST_PASSWORD = 'Skyl3rL0m1s';

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

async function identifyIssues() {
  console.log('🔍 Identifying Issues for 100% Success\n');

  // Login
  const loginRes = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });
  const authToken = loginRes.data.session.access_token;
  const authHeaders = { 'Authorization': `Bearer ${authToken}` };

  // Test 1: Auth Register - check exact error
  console.log('1. Testing Auth Register...');
  const regRes = await makeRequest('auth-register', {
    method: 'POST',
    body: JSON.stringify({ 
      email: `newuser${Date.now()}@test.com`, 
      password: 'TestPass123!', 
      fullName: 'New Test User' 
    })
  });
  console.log(`   Status: ${regRes.status} - ${regRes.data?.error || 'OK'}`);

  // Test 2: Analytics - check permissions
  console.log('\n2. Testing Analytics...');
  const analyticsRes = await makeRequest('analytics-telemetry', { 
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ event: 'test', data: {} })
  });
  console.log(`   Status: ${analyticsRes.status} - ${analyticsRes.data?.error || 'OK'}`);

  // Test 3: Check user roles
  console.log('\n3. Checking User Roles...');
  const userRes = await makeRequest('admin-users-id', {
    method: 'GET',
    headers: authHeaders
  });
  console.log(`   Admin Access: ${userRes.status} - ${userRes.data?.error || 'OK'}`);

  // Test 4: Try different analytics endpoint
  console.log('\n4. Testing Analytics Dashboard...');
  const dashRes = await makeRequest('analytics-predictive-dashboard', { 
    headers: authHeaders 
  });
  console.log(`   Dashboard: ${dashRes.status} - ${dashRes.data?.error || 'OK'}`);

  console.log('\n📋 Issues Summary:');
  console.log(`❌ Auth Register: ${regRes.ok ? 'FIXED' : regRes.data?.error}`);
  console.log(`❌ Analytics: ${analyticsRes.ok ? 'FIXED' : analyticsRes.data?.error}`);
  
  console.log('\n🔧 Required Fixes:');
  if (!regRes.ok) {
    console.log('- Fix user registration validation or duplicate handling');
  }
  if (!analyticsRes.ok) {
    console.log('- Grant analytics permissions to authenticated users');
    console.log('- Or create user_roles entry for current user');
  }
}

identifyIssues().catch(console.error);