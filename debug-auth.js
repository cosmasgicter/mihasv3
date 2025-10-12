#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'https://apply.mihas.edu.zm';
const TEST_EMAIL = 'alexisstar8@gmail.com';
const TEST_PASSWORD = 'Skyl3rL0m1s';
const TEST_FULL_NAME = 'Alexis Star Test User';

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}/.netlify/functions/${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
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
  
  console.log(`🔄 Making request to: ${url}`);
  console.log(`   Method: ${requestOptions.method || 'GET'}`);
  if (requestOptions.body) {
    console.log(`   Body: ${requestOptions.body}`);
  }
  
  try {
    const response = await fetch(url, requestOptions);
    const data = await response.json();
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    console.log(`   Error: ${error.message}`);
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      error: error.message,
      data: null
    };
  }
}

async function testRegistration() {
  console.log('\n=== TESTING REGISTRATION ===');
  
  const registrationData = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    fullName: TEST_FULL_NAME
  };
  
  const response = await makeRequest('auth-register', {
    method: 'POST',
    body: JSON.stringify(registrationData)
  });
  
  return response;
}

async function testLogin() {
  console.log('\n=== TESTING LOGIN ===');
  
  const loginData = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  };
  
  const response = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify(loginData)
  });
  
  return response;
}

async function testWithDifferentPassword() {
  console.log('\n=== TESTING WITH SIMPLE PASSWORD ===');
  
  const simplePassword = 'password123';
  const testEmail = 'test@example.com';
  
  // Try registration with simple credentials
  console.log('\n--- Registration with simple credentials ---');
  const regResponse = await makeRequest('auth-register', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      password: simplePassword,
      fullName: 'Test User'
    })
  });
  
  if (regResponse.ok || regResponse.data?.error?.includes('already exists')) {
    console.log('\n--- Login with simple credentials ---');
    const loginResponse = await makeRequest('auth-login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: simplePassword
      })
    });
    
    return loginResponse;
  }
  
  return regResponse;
}

async function main() {
  console.log('🔍 Debugging Authentication Issues');
  console.log(`📧 Email: ${TEST_EMAIL}`);
  console.log(`🔑 Password: ${TEST_PASSWORD}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  
  // Test 1: Try registration
  const regResult = await testRegistration();
  
  // Test 2: Try login
  const loginResult = await testLogin();
  
  // Test 3: Try with different credentials
  const simpleResult = await testWithDifferentPassword();
  
  console.log('\n=== SUMMARY ===');
  console.log(`Registration: ${regResult.ok ? 'SUCCESS' : 'FAILED'} (${regResult.status})`);
  console.log(`Login: ${loginResult.ok ? 'SUCCESS' : 'FAILED'} (${loginResult.status})`);
  console.log(`Simple Test: ${simpleResult.ok ? 'SUCCESS' : 'FAILED'} (${simpleResult.status})`);
}

main().catch(console.error);