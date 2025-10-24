#!/usr/bin/env node

/**
 * MIHAS Quick Function Test
 * Simple test of core functions with live credentials
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  baseUrl: 'https://mihasv3.pages.dev',
  supabaseUrl: 'https://mylgegkqoddcrxtwcclb.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw',
  adminCredentials: {
    email: 'cosmas@beanola.com',
    password: 'Beanola2025'
  },
  timeout: 10000
};

// Test results
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  functions: {},
  startTime: new Date()
};

let adminToken = null;

// Utility function for HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MIHAS-Quick-Test/1.0',
        ...options.headers
      },
      timeout: CONFIG.timeout
    };

    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = {
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json: null
        };
        
        if (data) {
          try {
            result.json = JSON.parse(data);
          } catch (e) {
            // Not JSON
          }
        }
        
        resolve(result);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Authentication
async function authenticate() {
  console.log('🔐 Authenticating admin user...');
  
  try {
    const response = await makeRequest(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.supabaseKey,
        'Authorization': `Bearer ${CONFIG.supabaseKey}`
      },
      body: JSON.stringify({
        email: CONFIG.adminCredentials.email,
        password: CONFIG.adminCredentials.password
      })
    });

    if (response.json && response.json.access_token) {
      adminToken = response.json.access_token;
      console.log('✅ Admin authenticated successfully');
      return true;
    } else {
      console.log('❌ Admin authentication failed');
      console.log('Response:', response.body);
      return false;
    }
  } catch (error) {
    console.error('❌ Authentication error:', error.message);
    return false;
  }
}

// Test a single function
async function testFunction(path, method = 'GET', requiresAuth = false) {
  console.log(`🧪 Testing: ${method} ${path}`);
  
  testResults.total++;
  const testStart = new Date();
  
  try {
    let headers = {};
    if (requiresAuth && adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }
    
    const url = `${CONFIG.baseUrl}${path}`;
    const response = await makeRequest(url, {
      method,
      headers
    });
    
    const isSuccess = response.status >= 200 && response.status < 400;
    
    testResults.functions[path] = {
      method,
      status: response.status,
      success: isSuccess,
      duration: new Date() - testStart,
      hasBody: !!response.body,
      bodyLength: response.body ? response.body.length : 0
    };
    
    if (isSuccess) {
      testResults.passed++;
      console.log(`   ✅ PASSED (${response.status})`);
    } else {
      testResults.failed++;
      console.log(`   ❌ FAILED (${response.status})`);
      if (response.json && response.json.error) {
        console.log(`   Error: ${response.json.error}`);
      }
    }
    
  } catch (error) {
    testResults.failed++;
    testResults.functions[path] = {
      method,
      error: error.message,
      success: false,
      duration: new Date() - testStart
    };
    console.log(`   💥 ERROR: ${error.message}`);
  }
}

// Main test function
async function runTests() {
  console.log('🚀 MIHAS Quick Function Test');
  console.log('============================');
  console.log(`🌐 Base URL: ${CONFIG.baseUrl}`);
  console.log(`📅 Started: ${testResults.startTime.toISOString()}`);
  
  // Authenticate first
  const authSuccess = await authenticate();
  
  console.log('\n🧪 Testing Core Functions:');
  console.log('---------------------------');
  
  // Test core functions
  await testFunction('/health', 'GET', false);
  await testFunction('/test', 'GET', false);
  await testFunction('/catalog/programs', 'GET', false);
  await testFunction('/catalog/intakes', 'GET', false);
  
  if (authSuccess) {
    console.log('\n🔐 Testing Authenticated Functions:');
    console.log('-----------------------------------');
    await testFunction('/applications', 'GET', true);
    await testFunction('/admin/dashboard', 'GET', true);
    await testFunction('/notifications', 'GET', true);
  }
  
  // Generate report
  testResults.endTime = new Date();
  testResults.duration = testResults.endTime - testResults.startTime;
  
  console.log('\n📊 TEST RESULTS:');
  console.log('================');
  console.log(`⏱️  Duration: ${Math.round(testResults.duration / 1000)}s`);
  console.log(`📈 Total: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📊 Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`);
  
  // Show failed functions
  const failedFunctions = Object.entries(testResults.functions)
    .filter(([_, func]) => !func.success);
  
  if (failedFunctions.length > 0) {
    console.log('\n❌ Failed Functions:');
    failedFunctions.forEach(([path, func]) => {
      console.log(`   ${path}: ${func.error || func.status}`);
    });
  }
  
  // Save results
  const resultsPath = path.join(__dirname, '../../archive/test-results/quick-test-results.json');
  const resultsDir = path.dirname(resultsPath);
  
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
}

export { runTests, testResults, CONFIG };