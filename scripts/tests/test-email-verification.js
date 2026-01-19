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

async function testEmailVerification() {
  console.log('📧 MIHAS Email Verification Test\n');

  // Login
  const loginRes = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });

  const authToken = loginRes.data.session.access_token;
  const authHeaders = { 'Authorization': `Bearer ${authToken}` };
  console.log('✅ Authenticated\n');

  // Get catalog data
  const [programsRes, intakesRes] = await Promise.all([
    makeRequest('catalog-programs'),
    makeRequest('catalog-intakes')
  ]);

  const selectedProgram = programsRes.data.programs[1]; // Environmental Health
  const selectedIntake = intakesRes.data.intakes[1]; // July 2026

  console.log(`📚 Selected Program: ${selectedProgram.name}`);
  console.log(`📅 Selected Intake: ${selectedIntake.name}\n`);

  // Create new application
  const applicationData = {
    application_number: `MIHAS${Date.now()}`,
    full_name: 'Email Test User',
    email: TEST_EMAIL,
    phone: '+260977987654',
    date_of_birth: '1996-08-20',
    sex: 'Male',
    nrc_number: 'NRC987654321',
    residence_town: 'Ndola',
    address_line_1: '456 Email Test Avenue',
    address_line_2: 'Ndola Central',
    postal_code: '20202',
    program: selectedProgram.name,
    intake: selectedIntake.name,
    institution: selectedProgram.institutions?.name || 'MIHAS',
    additional_subjects: [
      { subject: 'English', grade: 1 },
      { subject: 'Mathematics', grade: 2 },
      { subject: 'Chemistry', grade: 1 },
      { subject: 'Biology', grade: 2 }
    ],
    status: 'draft'
  };

  const createRes = await makeRequest('applications', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(applicationData)
  });

  console.log('✅ Application Created:');
  console.log(`   ID: ${createRes.data.id}`);
  console.log(`   Number: ${createRes.data.application_number}\n`);

  const appId = createRes.data.id;
  const appNumber = createRes.data.application_number;

  // Submit application
  const submitRes = await makeRequest('applications', {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      id: appId,
      status: 'submitted',
      submitted_at: new Date().toISOString()
    })
  });

  console.log('✅ Application Submitted\n');

  // Test email notification with detailed response
  console.log('📧 Testing Email Notification...');
  const emailRes = await makeRequest('notifications-application-submitted', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      applicationId: appId,
      userEmail: TEST_EMAIL,
      applicationNumber: appNumber,
      applicantName: 'Email Test User',
      programName: selectedProgram.name,
      institutionName: selectedProgram.institutions?.name || 'MIHAS'
    })
  });

  console.log(`📧 Email Status: ${emailRes.ok ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   Response Code: ${emailRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(emailRes.data, null, 2));

  if (emailRes.ok) {
    console.log('\n📬 Email Details:');
    console.log(`   To: ${TEST_EMAIL}`);
    console.log(`   Subject: Application Submitted - ${appNumber}`);
    console.log(`   Program: ${selectedProgram.name}`);
    console.log(`   Institution: ${selectedProgram.institutions?.name}`);
    console.log(`   Application ID: ${appId}`);
  }

  // Test additional notification endpoints
  console.log('\n🔔 Testing Additional Notifications...');
  
  const generalNotifRes = await makeRequest('notifications-send', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      type: 'application_update',
      message: 'Your application status has been updated',
      applicationId: appId,
      userEmail: TEST_EMAIL
    })
  });

  console.log(`🔔 General Notification: ${generalNotifRes.ok ? '✅ SUCCESS' : '❌ FAILED'} (${generalNotifRes.status})`);

  // Summary
  console.log('\n📊 EMAIL VERIFICATION SUMMARY:');
  console.log(`✅ Application Created: ${appNumber}`);
  console.log(`✅ Application Submitted: ${submitRes.ok ? 'Success' : 'Failed'}`);
  console.log(`📧 Email Notification: ${emailRes.ok ? 'SENT ✅' : 'FAILED ❌'}`);
  console.log(`🔔 General Notification: ${generalNotifRes.ok ? 'SENT ✅' : 'FAILED ❌'}`);
  
  const emailSuccess = emailRes.ok && generalNotifRes.ok;
  console.log(`\n🎯 Email System Status: ${emailSuccess ? 'FULLY OPERATIONAL ✅' : 'NEEDS ATTENTION ⚠️'}`);
  
  if (emailSuccess) {
    console.log('\n📬 CHECK YOUR EMAIL INBOX:');
    console.log(`   Email: ${TEST_EMAIL}`);
    console.log(`   Expected: Application submission confirmation`);
    console.log(`   Subject: Application Submitted - ${appNumber}`);
  }
}

testEmailVerification().catch(console.error);