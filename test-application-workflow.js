#!/usr/bin/env node

/**
 * MIHAS Application System - Complete Workflow Test
 * Tests the entire application procedure using real credentials
 * Email: alexisstar8@gmail.com
 * Password: Skyl3rL0m1s
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Configuration
const BASE_URL = '***REMOVED***';
const TEST_EMAIL = 'alexisstar8@gmail.com';
const TEST_PASSWORD = 'Skyl3rL0m1s';
const TEST_FULL_NAME = 'Alexis Star Test User';

// Test results storage
const testResults = {
  timestamp: new Date().toISOString(),
  email: TEST_EMAIL,
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0
  }
};

// Helper functions
function logTest(name, status, details = {}) {
  const test = {
    name,
    status,
    timestamp: new Date().toISOString(),
    ...details
  };
  
  testResults.tests.push(test);
  testResults.summary.total++;
  
  if (status === 'PASS') {
    testResults.summary.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.summary.failed++;
    console.log(`❌ ${name}`);
    if (details.error) {
      console.log(`   Error: ${details.error}`);
    }
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
  
  try {
    const response = await fetch(url, requestOptions);
    const data = await response.json();
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      headers: Object.fromEntries(response.headers.entries())
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

// Test functions
async function testHealthCheck() {
  console.log('\n🏥 Testing Health Check...');
  
  const response = await makeRequest('health');
  
  if (response.ok && response.data?.status === 'healthy') {
    logTest('Health Check', 'PASS', { response: response.data });
    return true;
  } else {
    logTest('Health Check', 'FAIL', { 
      error: `Status: ${response.status}, Data: ${JSON.stringify(response.data)}`,
      response: response.data 
    });
    return false;
  }
}

async function testUserRegistration() {
  console.log('\n👤 Testing User Registration...');
  
  const registrationData = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    fullName: TEST_FULL_NAME
  };
  
  const response = await makeRequest('auth-register', {
    method: 'POST',
    body: JSON.stringify(registrationData)
  });
  
  if (response.ok && response.data?.user) {
    logTest('User Registration', 'PASS', { 
      response: { 
        userId: response.data.user.id,
        email: response.data.user.email,
        hasSession: !!response.data.session
      }
    });
    return response.data;
  } else {
    // User might already exist, try login instead
    if (response.data?.error?.includes('already exists') || response.data?.error?.includes('duplicate')) {
      logTest('User Registration', 'PASS', { 
        response: { message: 'User already exists, will proceed with login' }
      });
      return { alreadyExists: true };
    } else {
      logTest('User Registration', 'FAIL', { 
        error: response.data?.error || `Status: ${response.status}`,
        response: response.data 
      });
      return null;
    }
  }
}

async function testUserLogin() {
  console.log('\n🔐 Testing User Login...');
  
  const loginData = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  };
  
  const response = await makeRequest('auth-login', {
    method: 'POST',
    body: JSON.stringify(loginData)
  });
  
  if (response.ok && response.data?.session) {
    logTest('User Login', 'PASS', { 
      response: { 
        userId: response.data.user?.id,
        email: response.data.user?.email,
        accessToken: response.data.session.access_token ? 'Present' : 'Missing'
      }
    });
    return response.data;
  } else {
    logTest('User Login', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return null;
  }
}

async function testCatalogPrograms() {
  console.log('\n📚 Testing Catalog Programs...');
  
  const response = await makeRequest('catalog-programs');
  
  if (response.ok && response.data?.programs) {
    logTest('Catalog Programs', 'PASS', { 
      response: { 
        programCount: response.data.programs.length,
        samplePrograms: response.data.programs.slice(0, 3).map(p => ({
          id: p.id,
          name: p.name,
          institution: p.institutions?.name
        }))
      }
    });
    return response.data.programs;
  } else {
    logTest('Catalog Programs', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return [];
  }
}

async function testCatalogIntakes() {
  console.log('\n📅 Testing Catalog Intakes...');
  
  const response = await makeRequest('catalog-intakes');
  
  if (response.ok && response.data?.intakes) {
    logTest('Catalog Intakes', 'PASS', { 
      response: { 
        intakeCount: response.data.intakes.length,
        sampleIntakes: response.data.intakes.slice(0, 3).map(i => ({
          id: i.id,
          name: i.name,
          year: i.year,
          deadline: i.application_deadline
        }))
      }
    });
    return response.data.intakes;
  } else {
    logTest('Catalog Intakes', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return [];
  }
}

async function testApplicationSubmission(authToken, programs, intakes) {
  console.log('\n📝 Testing Application Submission...');
  
  if (!programs.length || !intakes.length) {
    logTest('Application Submission', 'FAIL', { 
      error: 'No programs or intakes available for testing'
    });
    return null;
  }
  
  const selectedProgram = programs[0];
  const selectedIntake = intakes[0];
  
  const applicationData = {
    // Personal Information
    full_name: TEST_FULL_NAME,
    email: TEST_EMAIL,
    phone: '+260977123456',
    date_of_birth: '1995-06-15',
    gender: 'male',
    nationality: 'Zambian',
    nrc_number: 'NRC123456789',
    
    // Address Information
    address_line_1: '123 Test Street',
    address_line_2: 'Test Area',
    city: 'Lusaka',
    province: 'Lusaka',
    postal_code: '10101',
    country: 'Zambia',
    
    // Program Selection
    program: selectedProgram.name,
    program_id: selectedProgram.id,
    institution: selectedProgram.institutions?.name || 'MIHAS',
    intake_id: selectedIntake.id,
    intake_year: selectedIntake.year,
    
    // Academic Information
    highest_qualification: 'Grade 12 Certificate',
    school_name: 'Test High School',
    graduation_year: 2013,
    
    // Grades (Zambian system)
    english_grade: 2,
    mathematics_grade: 3,
    science_grade: 2,
    additional_subjects: [
      { subject: 'Biology', grade: 2 },
      { subject: 'Chemistry', grade: 3 },
      { subject: 'Physics', grade: 2 }
    ],
    
    // Application metadata
    status: 'draft',
    application_type: 'new',
    payment_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const response = await makeRequest('applications', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify(applicationData)
  });
  
  if (response.ok && response.data?.id) {
    logTest('Application Submission', 'PASS', { 
      response: { 
        applicationId: response.data.id,
        status: response.data.status,
        program: response.data.program,
        applicantName: response.data.full_name
      }
    });
    return response.data;
  } else {
    logTest('Application Submission', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return null;
  }
}

async function testApplicationRetrieval(authToken, applicationId) {
  console.log('\n📋 Testing Application Retrieval...');
  
  if (!applicationId) {
    logTest('Application Retrieval', 'FAIL', { 
      error: 'No application ID provided'
    });
    return null;
  }
  
  const response = await makeRequest(`applications-id?id=${applicationId}`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  if (response.ok && response.data) {
    logTest('Application Retrieval', 'PASS', { 
      response: { 
        applicationId: response.data.id,
        status: response.data.status,
        program: response.data.program,
        lastUpdated: response.data.updated_at
      }
    });
    return response.data;
  } else {
    logTest('Application Retrieval', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return null;
  }
}

async function testApplicationUpdate(authToken, applicationId) {
  console.log('\n✏️ Testing Application Update...');
  
  if (!applicationId) {
    logTest('Application Update', 'FAIL', { 
      error: 'No application ID provided'
    });
    return null;
  }
  
  const updateData = {
    id: applicationId,
    phone: '+260977654321',
    address_line_2: 'Updated Test Area',
    status: 'submitted',
    updated_at: new Date().toISOString()
  };
  
  const response = await makeRequest('applications', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify(updateData)
  });
  
  if (response.ok && response.data) {
    logTest('Application Update', 'PASS', { 
      response: { 
        applicationId: response.data.id,
        status: response.data.status,
        updatedPhone: response.data.phone,
        updatedAddress: response.data.address_line_2
      }
    });
    return response.data;
  } else {
    logTest('Application Update', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return null;
  }
}

async function testApplicationsList(authToken) {
  console.log('\n📊 Testing Applications List...');
  
  const response = await makeRequest('applications?mine=true&page=0&pageSize=10', {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  if (response.ok && response.data?.applications) {
    logTest('Applications List', 'PASS', { 
      response: { 
        totalApplications: response.data.totalCount,
        currentPage: response.data.page,
        applicationsOnPage: response.data.applications.length,
        sampleApplications: response.data.applications.slice(0, 2).map(app => ({
          id: app.id,
          status: app.status,
          program: app.program
        }))
      }
    });
    return response.data;
  } else {
    logTest('Applications List', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return null;
  }
}

async function testDocumentUpload(authToken) {
  console.log('\n📎 Testing Document Upload...');
  
  // Create a simple test file
  const testFileContent = Buffer.from('This is a test document for MIHAS application system');
  const fileName = 'test-document.txt';
  
  // Create FormData equivalent for Node.js
  const boundary = '----formdata-test-boundary';
  const formData = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    'Content-Type: text/plain',
    '',
    testFileContent.toString(),
    `--${boundary}`,
    'Content-Disposition: form-data; name="type"',
    '',
    'academic_transcript',
    `--${boundary}--`
  ].join('\r\n');
  
  const response = await makeRequest('documents-upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: formData
  });
  
  if (response.ok && response.data?.url) {
    logTest('Document Upload', 'PASS', { 
      response: { 
        fileName: response.data.fileName || fileName,
        fileSize: response.data.fileSize || testFileContent.length,
        uploadUrl: response.data.url ? 'Generated' : 'Missing'
      }
    });
    return response.data;
  } else {
    logTest('Document Upload', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return null;
  }
}

async function testNotificationSystem(authToken, applicationId) {
  console.log('\n🔔 Testing Notification System...');
  
  if (!applicationId) {
    logTest('Notification System', 'FAIL', { 
      error: 'No application ID provided'
    });
    return null;
  }
  
  const notificationData = {
    applicationId,
    type: 'application_submitted',
    message: 'Your application has been submitted successfully'
  };
  
  const response = await makeRequest('notifications-send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify(notificationData)
  });
  
  if (response.ok) {
    logTest('Notification System', 'PASS', { 
      response: { 
        notificationType: notificationData.type,
        applicationId: notificationData.applicationId,
        status: 'sent'
      }
    });
    return response.data;
  } else {
    logTest('Notification System', 'FAIL', { 
      error: response.data?.error || `Status: ${response.status}`,
      response: response.data 
    });
    return null;
  }
}

// Main test execution
async function runAllTests() {
  console.log('🚀 Starting MIHAS Application System Workflow Test');
  console.log(`📧 Testing with email: ${TEST_EMAIL}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log('=' .repeat(60));
  
  let authSession = null;
  let programs = [];
  let intakes = [];
  let application = null;
  
  // 1. Health Check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Health check failed. Stopping tests.');
    return;
  }
  
  // 2. User Registration (or skip if exists)
  const registrationResult = await testUserRegistration();
  
  // 3. User Login
  authSession = await testUserLogin();
  if (!authSession) {
    console.log('\n❌ Login failed. Cannot continue with authenticated tests.');
    return;
  }
  
  // 4. Catalog Programs
  programs = await testCatalogPrograms();
  
  // 5. Catalog Intakes
  intakes = await testCatalogIntakes();
  
  // 6. Application Submission
  application = await testApplicationSubmission(
    authSession.session.access_token, 
    programs, 
    intakes
  );
  
  if (application) {
    // 7. Application Retrieval
    await testApplicationRetrieval(
      authSession.session.access_token, 
      application.id
    );
    
    // 8. Application Update
    await testApplicationUpdate(
      authSession.session.access_token, 
      application.id
    );
    
    // 9. Applications List
    await testApplicationsList(authSession.session.access_token);
    
    // 10. Document Upload
    await testDocumentUpload(authSession.session.access_token);
    
    // 11. Notification System
    await testNotificationSystem(
      authSession.session.access_token, 
      application.id
    );
  }
  
  // Generate final report
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.summary.passed}`);
  console.log(`❌ Failed: ${testResults.summary.failed}`);
  console.log(`📊 Total: ${testResults.summary.total}`);
  console.log(`📈 Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);
  
  // Save detailed results
  const resultsFile = path.join(process.cwd(), 'application-workflow-test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Detailed results saved to: ${resultsFile}`);
  
  if (testResults.summary.failed > 0) {
    console.log('\n⚠️  Some tests failed. Check the detailed results for more information.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! The application workflow is working correctly.');
    process.exit(0);
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error('\n💥 Test execution failed:', error);
  process.exit(1);
});