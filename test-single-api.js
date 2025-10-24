#!/usr/bin/env node

/**
 * Single API Test - Debug specific endpoint
 */

const BASE_URL = 'https://apply.mihas.edu.zm';
const TEST_EMAIL = 'cosmas@beanola.com';
const TEST_PASSWORD = 'Beanola2025';

async function testSingleEndpoint() {
  try {
    // First login
    console.log('🔐 Logging in...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    const loginData = await loginResponse.json();
    console.log('Login response:', loginResponse.status, loginResponse.ok);
    
    if (!loginResponse.ok) {
      console.log('Login failed:', loginData);
      return;
    }

    const token = loginData.session?.access_token || loginData.access_token;
    const userId = loginData.user?.id;
    
    console.log('Token:', token ? 'Present' : 'Missing');
    console.log('User ID:', userId);

    // Test profile endpoint
    console.log('\n👤 Testing profile endpoint...');
    const profileResponse = await fetch(`${BASE_URL}/api/users/profile/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const profileText = await profileResponse.text();
    console.log('Profile response status:', profileResponse.status);
    console.log('Profile response:', profileText);

    // Test registration with unique email
    console.log('\n📝 Testing registration...');
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User'
    };

    const regResponse = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    const regText = await regResponse.text();
    console.log('Registration response status:', regResponse.status);
    console.log('Registration response:', regText);

  } catch (error) {
    console.error('Test error:', error);
  }
}

testSingleEndpoint();