#!/usr/bin/env node

const BASE_URL = '***REMOVED***';
const TEST_EMAIL = 'cosmas@beanola.com';
const TEST_PASSWORD = 'Beanola2025';

async function testSpecificFixes() {
  try {
    // Login first
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
    });

    const loginData = await loginResponse.json();
    const token = loginData.session?.access_token || loginData.access_token;

    console.log('🔐 Login:', loginResponse.ok ? '✅' : '❌');

    if (!token) return;

    // Test Academic Summary
    console.log('\n📊 Testing Academic Summary...');
    const academicResponse = await fetch(`${BASE_URL}/applications/academic/summary`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const academicData = await academicResponse.text();
    console.log('Academic Summary:', academicResponse.ok ? '✅' : '❌', academicResponse.status);
    if (!academicResponse.ok) console.log('Error:', academicData);

    // Test Batch Export
    console.log('\n📤 Testing Batch Export...');
    const exportResponse = await fetch(`${BASE_URL}/api/batch/export`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Batch Export:', exportResponse.ok ? '✅' : '❌', exportResponse.status);
    if (!exportResponse.ok) {
      const exportData = await exportResponse.text();
      console.log('Error:', exportData);
    }

    // Test Interview Schedule
    console.log('\n📅 Testing Interview Schedule...');
    const interviewResponse = await fetch(`${BASE_URL}/interview/schedule`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const interviewData = await interviewResponse.text();
    console.log('Interview Schedule:', interviewResponse.ok ? '✅' : '❌', interviewResponse.status);
    if (!interviewResponse.ok) console.log('Error:', interviewData);

    // Test Registration
    console.log('\n📝 Testing Registration...');
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      full_name: 'Test User',
      phone: '+260123456789',
      date_of_birth: '1990-01-01',
      sex: 'Male',
      residence_town: 'Lusaka',
      nationality: 'Zambian',
      next_of_kin_name: 'Test Kin',
      next_of_kin_phone: '+260987654321'
    };

    const regResponse = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    const regData = await regResponse.text();
    console.log('Registration:', regResponse.ok ? '✅' : '❌', regResponse.status);
    if (!regResponse.ok) console.log('Error:', regData);

  } catch (error) {
    console.error('Test error:', error);
  }
}

testSpecificFixes();