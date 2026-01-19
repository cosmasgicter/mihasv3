#!/usr/bin/env node

/**
 * MIHAS Application System - Complete Workflow Test
 * Tests all workflows including mock authentication
 */

import fetch from 'node-fetch';
import fs from 'fs';

const BASE_URL = 'https://mihasv3.pages.dev';
const TEST_EMAIL = 'alexisstar8@gmail.com';
const TEST_PASSWORD = 'Skyl3rL0m1s';
const TEST_FULL_NAME = 'Alexis Star Test User';

const testResults = {
  timestamp: new Date().toISOString(),
  email: TEST_EMAIL,
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
      headers: response.headers
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

async function testCatalogData() {
  console.log('\n📚 Testing Catalog Data...');
  
  // Test Programs
  const programsResponse = await makeRequest('catalog-programs');
  let programs = [];
  
  if (programsResponse.ok && programsResponse.data?.programs) {
    logTest('Catalog Programs', 'PASS', { 
      response: { 
        programCount: programsResponse.data.programs.length,
        samplePrograms: programsResponse.data.programs.slice(0, 2).map(p => ({
          id: p.id,
          name: p.name,
          institution: p.institutions?.name || p.institution
        }))
      }
    });
    programs = programsResponse.data.programs;
  } else {
    logTest('Catalog Programs', 'FAIL', { 
      error: programsResponse.data?.error || `Status: ${programsResponse.status}`,
      response: programsResponse.data 
    });
  }
  
  // Test Intakes
  const intakesResponse = await makeRequest('catalog-intakes');
  let intakes = [];
  
  if (intakesResponse.ok && intakesResponse.data?.intakes) {
    logTest('Catalog Intakes', 'PASS', { 
      response: { 
        intakeCount: intakesResponse.data.intakes.length,
        sampleIntakes: intakesResponse.data.intakes.slice(0, 2).map(i => ({
          id: i.id,
          name: i.name,
          year: i.year,
          deadline: i.application_deadline
        }))
      }
    });
    intakes = intakesResponse.data.intakes;
  } else {
    logTest('Catalog Intakes', 'FAIL', { 
      error: intakesResponse.data?.error || `Status: ${intakesResponse.status}`,
      response: intakesResponse.data 
    });
  }
  
  // Test Subjects
  const subjectsResponse = await makeRequest('catalog-subjects');
  let subjects = [];
  
  if (subjectsResponse.ok && subjectsResponse.data) {
    logTest('Catalog Subjects', 'PASS', { 
      response: { 
        subjectCount: Array.isArray(subjectsResponse.data.subjects) ? subjectsResponse.data.subjects.length : 'N/A',
        hasSubjects: !!subjectsResponse.data.subjects
      }
    });
    subjects = subjectsResponse.data.subjects || [];
  } else {
    logTest('Catalog Subjects', 'FAIL', { 
      error: subjectsResponse.data?.error || `Status: ${subjectsResponse.status}`,
      response: subjectsResponse.data 
    });
  }
  
  return { programs, intakes, subjects };
}

async function testAuthenticationFlow() {
  console.log('\n🔐 Testing Authentication Flow...');
  
  // Test Registration
  const registrationData = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    fullName: TEST_FULL_NAME
  };
  
  const regResponse = await makeRequest('auth-register', {
    method: 'POST',
    body: JSON.stringify(registrationData)
  });
  
  if (regResponse.ok && regResponse.data?.user) {
    logTest('User Registration', 'PASS', { 
      response: { 
        userId: regResponse.data.user.id,
        email: regResponse.data.user.email,
        hasSession: !!regResponse.data.session
      }
    });
  } else if (regResponse.data?.error?.includes('already exists') || regResponse.data?.error?.includes('duplicate')) {
    logTest('User Registration', 'PASS', { 
      response: { message: 'User already exists, proceeding with login' }
    });
  } else {
    logTest('User Registration', 'FAIL', { 
      error: regResponse.data?.error || `Status: ${regResponse.status}`,
      response: regResponse.data 
    });
  }
  
  // Test Login
  const loginData = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  };
  
  const loginResponse = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify(loginData)
  });
  
  if (loginResponse.ok && loginResponse.data?.session) {
    logTest('User Login', 'PASS', { 
      response: { 
        userId: loginResponse.data.user?.id,
        email: loginResponse.data.user?.email,
        accessToken: loginResponse.data.session.access_token ? 'Present' : 'Missing'
      }
    });
    return loginResponse.data;
  } else {
    logTest('User Login', 'FAIL', { 
      error: loginResponse.data?.error || `Status: ${loginResponse.status}`,
      response: loginResponse.data 
    });
    return null;
  }
}

async function testApplicationWorkflow(authToken, programs, intakes) {
  console.log('\n📝 Testing Application Workflow...');
  
  if (!authToken) {
    logTest('Application Workflow', 'SKIP', { 
      error: 'No authentication token available'
    });
    return null;
  }
  
  if (!programs.length || !intakes.length) {
    logTest('Application Workflow', 'SKIP', { 
      error: 'No programs or intakes available'
    });
    return null;
  }
  
  const selectedProgram = programs[0];
  const selectedIntake = intakes[0];
  
  // Create Application
  const applicationData = {
    full_name: TEST_FULL_NAME,
    email: TEST_EMAIL,
    phone: '+260977123456',
    date_of_birth: '1995-06-15',
    gender: 'male',
    nationality: 'Zambian',
    nrc_number: 'NRC123456789',
    address_line_1: '123 Test Street',
    address_line_2: 'Test Area',
    city: 'Lusaka',
    province: 'Lusaka',
    postal_code: '10101',
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
    additional_subjects: [
      { subject: 'Biology', grade: 2 },
      { subject: 'Chemistry', grade: 3 }
    ],
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
  
  if (createResponse.ok && createResponse.data?.id) {
    logTest('Application Creation', 'PASS', { 
      response: { 
        applicationId: createResponse.data.id,
        status: createResponse.data.status,
        program: createResponse.data.program
      }
    });
    
    const applicationId = createResponse.data.id;
    
    // Test Application Retrieval
    const getResponse = await makeRequest(`applications-id?id=${applicationId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (getResponse.ok && getResponse.data) {
      logTest('Application Retrieval', 'PASS', { 
        response: { 
          applicationId: getResponse.data.id,
          status: getResponse.data.status,
          program: getResponse.data.program
        }
      });
    } else {
      logTest('Application Retrieval', 'FAIL', { 
        error: getResponse.data?.error || `Status: ${getResponse.status}`,
        response: getResponse.data 
      });
    }
    
    // Test Application Update
    const updateData = {
      id: applicationId,
      phone: '+260977654321',
      status: 'submitted'
    };
    
    const updateResponse = await makeRequest('applications', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(updateData)
    });
    
    if (updateResponse.ok && updateResponse.data) {
      logTest('Application Update', 'PASS', { 
        response: { 
          applicationId: updateResponse.data.id,
          status: updateResponse.data.status,
          updatedPhone: updateResponse.data.phone
        }
      });
    } else {
      logTest('Application Update', 'FAIL', { 
        error: updateResponse.data?.error || `Status: ${updateResponse.status}`,
        response: updateResponse.data 
      });
    }
    
    // Test Applications List
    const listResponse = await makeRequest('applications?mine=true&page=0&pageSize=10', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (listResponse.ok && listResponse.data?.applications) {
      logTest('Applications List', 'PASS', { 
        response: { 
          totalApplications: listResponse.data.totalCount,
          applicationsOnPage: listResponse.data.applications.length
        }
      });
    } else {
      logTest('Applications List', 'FAIL', { 
        error: listResponse.data?.error || `Status: ${listResponse.status}`,
        response: listResponse.data 
      });
    }
    
    return createResponse.data;
  } else {
    logTest('Application Creation', 'FAIL', { 
      error: createResponse.data?.error || `Status: ${createResponse.status}`,
      response: createResponse.data 
    });
    return null;
  }
}

async function testSecurityFeatures() {
  console.log('\n🔒 Testing Security Features...');
  
  // Test unauthorized access to protected endpoints
  const protectedEndpoints = [
    'applications',
    'documents-upload',
    'notifications-send'
  ];
  
  let securityTestsPassed = 0;
  
  for (const endpoint of protectedEndpoints) {
    const response = await makeRequest(endpoint, {
      method: endpoint === 'applications' ? 'GET' : 'POST',
      body: endpoint !== 'applications' ? JSON.stringify({}) : undefined
    });
    
    if (response.status === 401) {
      securityTestsPassed++;
    }
  }
  
  if (securityTestsPassed === protectedEndpoints.length) {
    logTest('Security - Unauthorized Access Protection', 'PASS', { 
      response: { 
        protectedEndpoints: protectedEndpoints.length,
        properlySecured: securityTestsPassed
      }
    });
  } else {
    logTest('Security - Unauthorized Access Protection', 'FAIL', { 
      error: `${securityTestsPassed}/${protectedEndpoints.length} endpoints properly secured`,
      response: { protectedEndpoints, securityTestsPassed }
    });
  }
  
  // Test input validation
  const validationTests = [
    { endpoint: 'auth-register', data: {} },
    { endpoint: 'auth-login', data: {} }
  ];
  
  let validationTestsPassed = 0;
  
  for (const test of validationTests) {
    const response = await makeRequest(test.endpoint, {
      method: 'POST',
      body: JSON.stringify(test.data)
    });
    
    if (response.status === 400 && response.data?.error) {
      validationTestsPassed++;
    }
  }
  
  if (validationTestsPassed === validationTests.length) {
    logTest('Security - Input Validation', 'PASS', { 
      response: { 
        validationTests: validationTests.length,
        workingValidation: validationTestsPassed
      }
    });
  } else {
    logTest('Security - Input Validation', 'FAIL', { 
      error: `${validationTestsPassed}/${validationTests.length} validation tests passed`,
      response: { validationTests, validationTestsPassed }
    });
  }
}

async function runCompleteWorkflowTest() {
  console.log('🚀 Starting MIHAS Complete Workflow Test');
  console.log(`📧 Testing with email: ${TEST_EMAIL}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log('=' .repeat(60));
  
  // 1. Health Check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Health check failed. System may be down.');
  }
  
  // 2. Test Catalog Data
  const { programs, intakes, subjects } = await testCatalogData();
  
  // 3. Test Authentication Flow
  const authSession = await testAuthenticationFlow();
  
  // 4. Test Application Workflow (if authenticated)
  if (authSession?.session?.access_token) {
    await testApplicationWorkflow(authSession.session.access_token, programs, intakes);
  } else {
    console.log('\n⚠️  Skipping application workflow tests due to authentication failure');
  }
  
  // 5. Test Security Features
  await testSecurityFeatures();
  
  // Generate final report
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPLETE WORKFLOW TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.summary.passed}`);
  console.log(`❌ Failed: ${testResults.summary.failed}`);
  console.log(`📊 Total: ${testResults.summary.total}`);
  console.log(`📈 Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);
  
  // Detailed breakdown
  console.log('\n📋 Test Categories:');
  const categories = {};
  testResults.tests.forEach(test => {
    const category = test.name.split(' ')[0];
    if (!categories[category]) categories[category] = { passed: 0, total: 0 };
    categories[category].total++;
    if (test.status === 'PASS') categories[category].passed++;
  });
  
  Object.entries(categories).forEach(([category, stats]) => {
    const rate = ((stats.passed / stats.total) * 100).toFixed(1);
    console.log(`   ${category}: ${stats.passed}/${stats.total} (${rate}%)`);
  });
  
  // Save detailed results
  const resultsFile = 'complete-workflow-test-results.json';
  fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Detailed results saved to: ${resultsFile}`);
  
  // System status assessment
  const criticalTests = ['Health', 'Catalog', 'Security'];
  const criticalPassed = testResults.tests.filter(test => 
    criticalTests.some(critical => test.name.includes(critical)) && test.status === 'PASS'
  ).length;
  
  console.log('\n🎯 System Status Assessment:');
  if (testResults.summary.passed === testResults.summary.total) {
    console.log('   🟢 EXCELLENT - All systems operational');
  } else if (criticalPassed >= 6) {
    console.log('   🟡 GOOD - Core systems operational, some features may have issues');
  } else {
    console.log('   🔴 NEEDS ATTENTION - Critical systems may have issues');
  }
  
  console.log('\n📝 Recommendations:');
  if (authSession) {
    console.log('   ✅ Authentication system is working');
  } else {
    console.log('   ⚠️  Authentication needs investigation - check Supabase configuration');
  }
  
  if (programs.length > 0 && intakes.length > 0) {
    console.log('   ✅ Catalog data is available for applications');
  } else {
    console.log('   ⚠️  Catalog data may be incomplete - check database seeding');
  }
  
  console.log('\n🎉 Test completed successfully!');
}

runCompleteWorkflowTest().catch(error => {
  console.error('\n💥 Test execution failed:', error);
  process.exit(1);
});