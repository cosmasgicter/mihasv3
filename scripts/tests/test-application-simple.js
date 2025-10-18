#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'https://apply.mihas.edu.zm';
const TEST_EMAIL = 'alexisstar8@gmail.com';
const TEST_PASSWORD = 'Skyl3rL0m1s';

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}/.netlify/functions/${endpoint}`;
  const requestOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    },
    ...options
  };
  
  console.log(`🔄 ${requestOptions.method || 'GET'} ${url}`);
  
  try {
    const response = await fetch(url, requestOptions);
    const data = await response.json();
    
    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.message,
      data: null
    };
  }
}

async function testCompleteWorkflow() {
  console.log('🚀 Testing Complete Application Workflow');
  
  // Step 1: Login
  console.log('\n🔐 Step 1: Login');
  const loginResponse = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    })
  });
  
  if (!loginResponse.ok) {
    console.log('❌ Login failed');
    return;
  }
  
  console.log('✅ Login successful');
  const authToken = loginResponse.data.session.access_token;
  
  // Step 2: Get Programs
  console.log('\n📚 Step 2: Get Programs');
  const programsResponse = await makeRequest('catalog-programs');
  if (!programsResponse.ok || !programsResponse.data.programs?.length) {
    console.log('❌ No programs available');
    return;
  }
  
  const selectedProgram = programsResponse.data.programs[0];
  console.log(`✅ Selected program: ${selectedProgram.name}`);
  
  // Step 3: Get Intakes
  console.log('\n📅 Step 3: Get Intakes');
  const intakesResponse = await makeRequest('catalog-intakes');
  if (!intakesResponse.ok || !intakesResponse.data.intakes?.length) {
    console.log('❌ No intakes available');
    return;
  }
  
  const selectedIntake = intakesResponse.data.intakes[0];
  console.log(`✅ Selected intake: ${selectedIntake.name}`);
  
  // Step 4: Create Simple Application
  console.log('\n📝 Step 4: Create Application');
  const applicationData = {
    full_name: 'Alexis Star Test User',
    email: TEST_EMAIL,
    phone: '+260977123456',
    date_of_birth: '1995-06-15',
    gender: 'male',
    nationality: 'Zambian',
    nrc_number: 'NRC123456789',
    address_line_1: '123 Test Street',
    city: 'Lusaka',
    province: 'Lusaka',
    country: 'Zambia',
    program: selectedProgram.name,
    program_id: selectedProgram.id,
    institution: selectedProgram.institutions?.name || 'MIHAS',
    intake_id: selectedIntake.id,
    intake_year: selectedIntake.year,
    highest_qualification: 'Grade 12 Certificate',
    school_name: 'Test High School',
    graduation_year: 2013,
    english_grade: 2,
    mathematics_grade: 3,
    science_grade: 2,
    status: 'draft',
    application_type: 'new',
    payment_status: 'pending'
  };
  
  const createResponse = await makeRequest('applications', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify(applicationData)
  });
  
  if (!createResponse.ok) {
    console.log(`❌ Application creation failed: ${createResponse.data?.error}`);
    
    // Try with minimal data
    console.log('\n🔄 Trying with minimal data...');
    const minimalData = {
      full_name: 'Alexis Star Test User',
      email: TEST_EMAIL,
      program: selectedProgram.name,
      status: 'draft'
    };
    
    const minimalResponse = await makeRequest('applications', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(minimalData)
    });
    
    if (minimalResponse.ok) {
      console.log('✅ Minimal application created');
      console.log(`   Application ID: ${minimalResponse.data.id}`);
      return minimalResponse.data;
    } else {
      console.log(`❌ Minimal application failed: ${minimalResponse.data?.error}`);
      return null;
    }
  }
  
  console.log('✅ Application created successfully');
  console.log(`   Application ID: ${createResponse.data.id}`);
  
  // Step 5: Test Application Retrieval
  console.log('\n📋 Step 5: Retrieve Application');
  const getResponse = await makeRequest(`applications-id?id=${createResponse.data.id}`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  if (getResponse.ok) {
    console.log('✅ Application retrieved successfully');
    console.log(`   Status: ${getResponse.data.status}`);
  } else {
    console.log(`❌ Application retrieval failed: ${getResponse.data?.error}`);
  }
  
  // Step 6: Test Application Update
  console.log('\n✏️ Step 6: Update Application');
  const updateResponse = await makeRequest('applications', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      id: createResponse.data.id,
      phone: '+260977654321',
      status: 'submitted'
    })
  });
  
  if (updateResponse.ok) {
    console.log('✅ Application updated successfully');
    console.log(`   New status: ${updateResponse.data.status}`);
  } else {
    console.log(`❌ Application update failed: ${updateResponse.data?.error}`);
  }
  
  // Step 7: Test Applications List
  console.log('\n📊 Step 7: List Applications');
  const listResponse = await makeRequest('applications?mine=true&page=0&pageSize=10', {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  if (listResponse.ok) {
    console.log('✅ Applications list retrieved');
    console.log(`   Total applications: ${listResponse.data.totalCount}`);
    console.log(`   Applications on page: ${listResponse.data.applications?.length || 0}`);
  } else {
    console.log(`❌ Applications list failed: ${listResponse.data?.error}`);
  }
  
  console.log('\n🎉 Workflow test completed!');
  return createResponse.data;
}

testCompleteWorkflow().catch(console.error);