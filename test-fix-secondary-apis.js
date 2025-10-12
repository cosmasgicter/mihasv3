#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = '***REMOVED***';
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

async function testSecondaryAPIs() {
  console.log('🔧 Testing & Fixing Secondary APIs\n');

  // Login
  const loginRes = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });
  
  const authToken = loginRes.data.session.access_token;
  console.log('✅ Authenticated\n');

  // Create application first
  const appData = {
    application_number: `MIHAS${Date.now()}`,
    full_name: 'Test User Fix',
    email: TEST_EMAIL,
    phone: '+260977123456',
    date_of_birth: '1995-06-15',
    sex: 'Male',
    nrc_number: 'NRC123456789',
    residence_town: 'Lusaka',
    program: 'Diploma in Clinical Medicine',
    intake: 'January 2026 Intake',
    institution: 'Kalulushi Training Centre',
    status: 'draft'
  };

  const createRes = await makeRequest('applications', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify(appData)
  });

  const appId = createRes.data.id;
  console.log('✅ Application created:', appId);

  // Fix 1: Application Update - try different approaches
  console.log('\n🔧 Fix 1: Application Update');
  
  // Try minimal update
  const updateRes1 = await makeRequest('applications', {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({
      id: appId,
      status: 'submitted'
    })
  });
  console.log(`PATCH method: ${updateRes1.ok ? '✅' : '❌'} ${updateRes1.status}`);

  // Try PUT with more fields
  const updateRes2 = await makeRequest('applications', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({
      id: appId,
      full_name: 'Test User Updated',
      status: 'submitted',
      phone: '+260977654321'
    })
  });
  console.log(`PUT method: ${updateRes2.ok ? '✅' : '❌'} ${updateRes2.status} - ${updateRes2.data?.error || 'OK'}`);

  // Fix 2: Document Upload - proper multipart format
  console.log('\n🔧 Fix 2: Document Upload');
  
  const boundary = '----formdata-boundary';
  const formData = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="test.pdf"',
    'Content-Type: application/pdf',
    '',
    'test-file-content',
    `--${boundary}`,
    'Content-Disposition: form-data; name="type"',
    '',
    'academic_transcript',
    `--${boundary}--`
  ].join('\r\n');

  const docRes = await makeRequest('documents-upload', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: formData
  });
  console.log(`Document upload: ${docRes.ok ? '✅' : '❌'} ${docRes.status} - ${docRes.data?.error || 'OK'}`);

  // Fix 3: Notifications - try different payload
  console.log('\n🔧 Fix 3: Notifications');
  
  const notifRes = await makeRequest('notifications-send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({
      type: 'application_submitted',
      message: 'Your application has been submitted successfully',
      userId: loginRes.data.user.id,
      applicationId: appId,
      email: TEST_EMAIL
    })
  });
  console.log(`Notifications: ${notifRes.ok ? '✅' : '❌'} ${notifRes.status} - ${notifRes.data?.error || 'OK'}`);

  // Summary
  console.log('\n📊 Secondary APIs Status:');
  console.log(`${updateRes1.ok || updateRes2.ok ? '✅' : '❌'} Application Update: ${updateRes1.ok || updateRes2.ok ? 'FIXED' : 'Still failing'}`);
  console.log(`${docRes.ok ? '✅' : '❌'} Document Upload: ${docRes.ok ? 'FIXED' : 'Still failing'}`);
  console.log(`${notifRes.ok ? '✅' : '❌'} Notifications: ${notifRes.ok ? 'FIXED' : 'Still failing'}`);

  const fixed = [updateRes1.ok || updateRes2.ok, docRes.ok, notifRes.ok].filter(Boolean).length;
  console.log(`\n🎯 Fixed: ${fixed}/3 secondary APIs`);
}

testSecondaryAPIs().catch(console.error);